/**
 * Eburon ASR — Speech-to-Text Service Client
 * Sends recorded audio to the Eburon ASR backend (Voxtral Mini) for transcription.
 */

const ASR_URL = import.meta.env.VITE_ASR_URL || 'http://localhost:5000';

export interface TranscriptionResult {
  text: string;
  service: string;
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');

  const res = await fetch(`${ASR_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Eburon ASR error: ${res.status}`);
  }

  const data: TranscriptionResult = await res.json();
  return data.text;
}

export async function checkAsrHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ASR_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok' && data.api_key_configured === true;
  } catch {
    return false;
  }
}
