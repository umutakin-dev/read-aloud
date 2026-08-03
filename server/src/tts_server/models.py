from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: str = Field(default="af_heart")
    speed: float = Field(default=1.0, ge=0.5, le=3.0)


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float
    # Character span of this word within the request text. None when the word
    # could not be aligned (Kokoro sometimes rewrites tokens, e.g. expanding
    # numerals), in which case the client falls back to its own estimate.
    start_char: int | None = None
    end_char: int | None = None


class TTSWithTimestampsResponse(BaseModel):
    audio_base64: str
    sample_rate: int = 24000
    timestamps: list[WordTimestamp]


class VoiceInfo(BaseModel):
    id: str
    name: str
    language: str
    gender: str
