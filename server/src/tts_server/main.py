import base64
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .models import TTSRequest, TTSWithTimestampsResponse, VoiceInfo, WordTimestamp
from .tts_engine import TTSEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Read Aloud TTS Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
