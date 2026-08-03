import base64
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .alignment import preview
from .models import TTSRequest, TTSWithTimestampsResponse, VoiceInfo, WordTimestamp
from .tts_engine import TTSEngine, log_environment

# READ_ALOUD_LOG_LEVEL=DEBUG adds per-chunk timing detail and the full list of
# tokens that could not be aligned to the request text.
LOG_LEVEL = os.environ.get("READ_ALOUD_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    datefmt="%H:%M:%S",
    force=True,
)
logger = logging.getLogger(__name__)

# Model downloads dump full request and response headers at DEBUG — hundreds of
# lines per file, which buries the synthesis and alignment output that DEBUG was
# turned on to see. Capped independently of this app's level; set
# READ_ALOUD_LOG_HTTP=1 on the rare occasion the wire traffic is the problem.
HTTP_LEVEL = logging.DEBUG if os.environ.get("READ_ALOUD_LOG_HTTP") == "1" else logging.WARNING
for noisy in ("httpx", "httpcore", "urllib3", "filelock", "huggingface_hub"):
    logging.getLogger(noisy).setLevel(HTTP_LEVEL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Read Aloud TTS server starting (log level %s)", LOG_LEVEL)
    # Reported up front so a CPU-only install is obvious before the first
    # request rather than after a slow one.
    log_environment()
    yield


app = FastAPI(title="Read Aloud TTS Server", version="0.1.0", lifespan=lifespan)

# Only the extension should be able to drive this server. With `allow_origins=["*"]`
# any site the user happened to be browsing could POST to it and occupy the GPU.
#
# Chrome extension IDs are 32 characters from a-p, and an unpacked extension gets
# a different one on every machine, so the default matches the shape rather than a
# specific ID. Override either setting for a different client:
#
#     READ_ALOUD_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
#     READ_ALOUD_ALLOWED_ORIGIN_REGEX=^chrome-extension://abcdef...$
#
# Note that the extension's own requests to a host it holds a permission for are
# not CORS requests at all, so this policy does not affect them.
DEFAULT_ORIGIN_REGEX = r"^chrome-extension://[a-p]{32}$"

allowed_origin_regex = os.environ.get(
    "READ_ALOUD_ALLOWED_ORIGIN_REGEX", DEFAULT_ORIGIN_REGEX
)
allowed_origins = [
    origin.strip()
    for origin in os.environ.get("READ_ALOUD_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    # No cookies or auth are involved, and credentialed wildcard origins are
    # invalid per the CORS spec anyway.
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

engine = TTSEngine()


@app.get("/api/health")
async def health():
    return {"status": "ok", "engine": "kokoro"}


@app.post("/api/tts")
async def tts(request: TTSRequest):
    try:
        audio, sr = engine.synthesize(request.text, request.voice, request.speed)
        wav_bytes = engine.audio_to_wav_bytes(audio, sr)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.exception("TTS synthesis failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts-with-timestamps", response_model=TTSWithTimestampsResponse)
async def tts_with_timestamps(request: TTSRequest):
    try:
        audio, sr, timestamps = engine.synthesize_with_timestamps(
            request.text, request.voice, request.speed
        )
        wav_bytes = engine.audio_to_wav_bytes(audio, sr)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii")
        logger.info(
            "Responding with %.1f KiB of WAV and %d timestamp(s)",
            len(wav_bytes) / 1024, len(timestamps),
        )
        return TTSWithTimestampsResponse(
            audio_base64=audio_b64,
            sample_rate=sr,
            timestamps=[WordTimestamp(**ts) for ts in timestamps],
        )
    except Exception as e:
        logger.exception("TTS with timestamps failed for: %s", preview(request.text))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voices", response_model=list[VoiceInfo])
async def voices():
    return [VoiceInfo(**v) for v in engine.list_voices()]
