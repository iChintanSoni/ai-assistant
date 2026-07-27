import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("../lib/transcribe", () => ({ transcribeAudio: vi.fn() }));

import { uploadFile } from "../lib/upload";
import { transcribeAudio } from "../lib/transcribe";
import { useVoiceInput } from "./useVoiceInput";

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  stream: { getTracks: () => FakeTrack[] };
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  tracks = [new FakeTrack()];

  constructor(stream: unknown) {
    this.stream = stream as { getTracks: () => FakeTrack[] };
    FakeMediaRecorder.instances.push(this);
  }
  start = vi.fn();
  stop = vi.fn(() => this.onstop?.());
  emitData(size: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: "audio/webm" }) });
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;
let streamTracks: FakeTrack[];

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  streamTracks = [new FakeTrack()];
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => streamTracks });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.mocked(uploadFile).mockReset();
  vi.mocked(transcribeAudio).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("toggle from idle requests the mic and starts recording", async () => {
  const { result } = renderHook(() => useVoiceInput(vi.fn()));

  act(() => result.current.toggle());
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
  await waitFor(() => expect(result.current.state).toBe("recording"));
  expect(FakeMediaRecorder.instances[0]!.start).toHaveBeenCalled();
});

test("stopping a recording with audio uploads it, transcribes it, and hands the text to onTranscript", async () => {
  const onTranscript = vi.fn();
  vi.mocked(uploadFile).mockResolvedValue({ url: "http://files/voice.webm", filename: "voice.webm", size: 1, mimetype: "audio/webm" });
  vi.mocked(transcribeAudio).mockResolvedValue("hello from the microphone");

  const { result } = renderHook(() => useVoiceInput(onTranscript));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.state).toBe("recording"));

  const recorder = FakeMediaRecorder.instances[0]!;
  act(() => recorder.emitData(10));
  act(() => result.current.toggle()); // stop

  await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello from the microphone"));
  expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: "voice-input.webm", type: "audio/webm" }));
  expect(transcribeAudio).toHaveBeenCalledWith("http://files/voice.webm");
  expect(streamTracks[0]!.stop).toHaveBeenCalled(); // mic track released once recording stops
  await waitFor(() => expect(result.current.state).toBe("idle"));
});

test("stopping a recording with no captured audio skips upload/transcribe entirely", async () => {
  const onTranscript = vi.fn();
  const { result } = renderHook(() => useVoiceInput(onTranscript));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.state).toBe("recording"));

  act(() => result.current.toggle()); // stop with no data chunks

  await waitFor(() => expect(result.current.state).toBe("idle"));
  expect(uploadFile).not.toHaveBeenCalled();
  expect(onTranscript).not.toHaveBeenCalled();
});

test("a getUserMedia rejection (e.g. permission denied) surfaces an error and stays idle", async () => {
  getUserMedia.mockRejectedValue(new Error("Permission denied"));
  const { result } = renderHook(() => useVoiceInput(vi.fn()));

  act(() => result.current.toggle());

  await waitFor(() => expect(result.current.error).toBe("Permission denied"));
  expect(result.current.state).toBe("idle");
});

test("a transcription failure surfaces an error and returns to idle", async () => {
  vi.mocked(uploadFile).mockResolvedValue({ url: "http://files/voice.webm", filename: "voice.webm", size: 1, mimetype: "audio/webm" });
  vi.mocked(transcribeAudio).mockRejectedValue(new Error("whisper-cli not configured"));

  const { result } = renderHook(() => useVoiceInput(vi.fn()));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.state).toBe("recording"));
  act(() => FakeMediaRecorder.instances[0]!.emitData(10));
  act(() => result.current.toggle());

  await waitFor(() => expect(result.current.error).toBe("whisper-cli not configured"));
  expect(result.current.state).toBe("idle");
});
