from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: str = Field(default="af_heart")
    speed: float = Field(default=1.0, ge=0.5, le=3.0)


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float


class TTSWithTimestampsResponse(BaseModel):
    audio_base64: str
    sample_rate: int = 24000
    timestamps: list[WordTimestamp]


class VoiceInfo(BaseModel):
    id: str
    name: str
    language: str
    gender: str
