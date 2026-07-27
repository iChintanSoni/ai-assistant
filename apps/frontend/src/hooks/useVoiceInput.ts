/**
 * Voice input: records a clip via MediaRecorder, uploads it to file-storage
 * (same path as any other attachment), then transcribes it via the agent's
 * /transcribe endpoint. The transcript is handed back for the caller to drop
 * into the composer text box for the user to review/edit — never auto-sent.
 */
import { useRef, useState } from "react";
import { uploadFile } from "../lib/upload";
import { transcribeAudio } from "../lib/transcribe";

export type VoiceInputState = "idle" | "recording" | "transcribing";

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function finishRecording() {
    const recorder = recorderRef.current;
    recorder?.stream.getTracks().forEach((t) => t.stop());
    const mimeType = recorder?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    recorderRef.current = null;

    if (blob.size === 0) {
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const file = new File([blob], `voice-input.${extensionFor(mimeType)}`, { type: mimeType });
      const uploaded = await uploadFile(file);
      const text = await transcribeAudio(uploaded.url);
      onTranscript(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't transcribe that recording.");
    } finally {
      setState("idle");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void finishRecording();
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't access the microphone.");
      setState("idle");
    }
  }

  function toggle() {
    if (state === "recording") recorderRef.current?.stop();
    else if (state === "idle") void startRecording();
  }

  return { state, error, toggle };
}
