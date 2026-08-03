import base64
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .models import TTSRequest, TTSWithTimestampsResponse, VoiceInfo, WordTimestamp
from .tts_engine import TTSEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Read Aloud TTS Server", version="0.1.0")

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
        return TTSWithTimestampsResponse(
            audio_base64=audio_b64,
            sample_rate=sr,
            timestamps=[WordTimestamp(**ts) for ts in timestamps],
        )
    except Exception as e:
        logger.exception("TTS with timestamps failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voices", response_model=list[VoiceInfo])
async def voices():
    return [VoiceInfo(**v) for v in engine.list_voices()]
