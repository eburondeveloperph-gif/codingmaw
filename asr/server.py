"""
Eburon ASR — Speech-to-Text Service
Powered by Voxtral Mini Realtime (Mistral AI)
"""

import asyncio
import base64
import os
import io
import wave
import subprocess
import tempfile

import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from mistralai import Mistral

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
MISTRAL_BASE_URL = "wss://api.mistral.ai"
MODEL = "voxtral-mini-transcribe-realtime-2602"
SAMPLE_RATE = 16_000


def convert_to_wav(audio_bytes: bytes, original_name: str = "recording.webm") -> bytes:
    """Convert any audio format (webm, mp4, ogg, etc.) to PCM16 WAV using ffmpeg."""
    # Try WAV parse first — skip ffmpeg if already WAV
    try:
        buf = io.BytesIO(audio_bytes)
        with wave.open(buf, "rb") as wf:
            wf.getnframes()
        return audio_bytes
    except Exception:
        pass

    # Use ffmpeg to convert to 16kHz mono PCM16 WAV
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src:
        src.write(audio_bytes)
        src_path = src.name

    dst_path = src_path.replace(".webm", ".wav")
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", src_path,
                "-ar", str(SAMPLE_RATE),
                "-ac", "1",
                "-sample_fmt", "s16",
                "-f", "wav",
                dst_path,
            ],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg error: {result.stderr.decode(errors='replace')[:200]}")
        with open(dst_path, "rb") as f:
            return f.read()
    finally:
        for p in (src_path, dst_path):
            try:
                os.unlink(p)
            except OSError:
                pass

app = FastAPI(title="Eburon ASR", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def audio_bytes_to_pcm16_b64_chunks(audio_bytes: bytes, chunk_duration_ms: int = 100):
    """Convert raw audio bytes (WAV format) to base64-encoded PCM16 chunks."""
    try:
        buf = io.BytesIO(audio_bytes)
        with wave.open(buf, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)
    except Exception:
        # Try treating as raw PCM16 mono 16kHz
        raw = audio_bytes
        n_channels = 1
        sampwidth = 2
        framerate = SAMPLE_RATE

    # Convert to numpy float32
    if sampwidth == 2:
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32767.0
    elif sampwidth == 4:
        samples = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483647.0
    else:
        samples = np.frombuffer(raw, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

    # Convert to mono
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    # Resample to 16kHz if needed
    if framerate != SAMPLE_RATE:
        num_samples = int(len(samples) * SAMPLE_RATE / framerate)
        samples = np.interp(
            np.linspace(0, len(samples) - 1, num_samples),
            np.arange(len(samples)),
            samples,
        )

    # Convert to PCM16
    pcm16 = (samples * 32767).astype(np.int16)

    # Split into chunks
    chunk_samples = int(SAMPLE_RATE * chunk_duration_ms / 1000)
    chunks = []
    for i in range(0, len(pcm16), chunk_samples):
        chunk = pcm16[i : i + chunk_samples]
        chunks.append(base64.b64encode(chunk.tobytes()).decode("utf-8"))

    return chunks


async def transcribe_audio(audio_bytes: bytes, api_key: str) -> str:
    """Send audio to Voxtral via Mistral Realtime API and collect transcription."""
    from mistralai.models import (
        AudioFormat,
        TranscriptionStreamTextDelta,
        TranscriptionStreamDone,
        RealtimeTranscriptionError,
    )

    chunks = audio_bytes_to_pcm16_b64_chunks(audio_bytes)
    if not chunks:
        return ""

    client = Mistral(api_key=api_key)
    transcription_text = ""

    try:
        async with client.realtime.stream(
            model=MODEL,
            options={
                "audio_format": AudioFormat.PCM16,
                "sample_rate": SAMPLE_RATE,
                "language": "en",
            },
        ) as stream:
            # Send all audio chunks
            for chunk in chunks:
                await stream.send_audio_chunk(data=chunk)
                await asyncio.sleep(0.01)  # Small delay to avoid overwhelming

            # Signal end of audio
            await stream.stop()

            # Collect transcription
            async for event in stream:
                if isinstance(event, TranscriptionStreamTextDelta):
                    transcription_text += event.delta or ""
                elif isinstance(event, TranscriptionStreamDone):
                    break
                elif isinstance(event, RealtimeTranscriptionError):
                    raise Exception(f"Transcription error: {event.message}")

    except Exception as e:
        if transcription_text:
            return transcription_text.strip()
        raise e

    return transcription_text.strip()


@app.get("/health")
async def health():
    has_key = bool(MISTRAL_API_KEY)
    return {"status": "ok", "service": "Eburon ASR", "api_key_configured": has_key}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe an audio file to text using Eburon ASR (Voxtral Mini)."""
    api_key = MISTRAL_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="Eburon ASR: MISTRAL_API_KEY not configured")

    try:
        audio_bytes = await file.read()
        if len(audio_bytes) < 100:
            return JSONResponse(content={"text": "", "service": "Eburon ASR"})

        # Convert browser audio (webm/mp4) to WAV for Voxtral
        wav_bytes = convert_to_wav(audio_bytes, file.filename or "recording.webm")

        text = await transcribe_audio(wav_bytes, api_key)
        return JSONResponse(content={"text": text, "service": "Eburon ASR"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eburon ASR error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "5100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
