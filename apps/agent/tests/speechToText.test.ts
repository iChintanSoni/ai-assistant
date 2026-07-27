import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { transcribeAudio } from "../src/agent/speechToText.js";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

const scratchDir = () => path.join(config.dataDir, "transcribe-tmp");
const clipPath = () => path.join(scratchDir(), "clip.wav");
const transcodedPath = () => `${clipPath()}.transcode.wav`;
const clipUrl = () => `${config.fileStorageBaseUrl}/files/clip.wav`;

beforeEach(() => {
  vi.mocked(spawn).mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(scratchDir(), { recursive: true, force: true });
});

function mockDownload(bytes = "fake audio bytes") {
  vi.mocked(fetch).mockResolvedValue(new Response(bytes, { status: 200 }));
}

/** ffmpeg is always spawn call #1 — this makes it succeed trivially so tests can focus on whisper-cli (call #2). */
function mockFfmpegSuccess() {
  vi.mocked(spawn).mockImplementationOnce((_cmd, argv) => {
    expect(argv).toEqual(["-y", "-i", clipPath(), "-ar", "16000", "-ac", "1", "-f", "wav", transcodedPath()]);
    const child = fakeChild();
    queueMicrotask(() => child.emit("close", 0));
    return child as never;
  });
}

test("transcribeAudio downloads the audio, transcodes via ffmpeg, runs whisper-cli, and returns the trimmed transcript", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    mockDownload();
    mockFfmpegSuccess();
    vi.mocked(spawn).mockImplementationOnce((_cmd, argv) => {
      expect(argv).toEqual(["-m", "/models/ggml-tiny.en.bin", "-f", transcodedPath(), "-nt", "-np"]);
      const child = fakeChild();
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from(" hello world\n"));
        child.emit("close", 0);
      });
      return child as never;
    });

    const text = await transcribeAudio(clipUrl());

    expect(text).toBe("hello world");
    expect(fetch).toHaveBeenCalledWith(clipUrl(), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fs.existsSync(clipPath())).toBe(false); // cleaned up
    expect(fs.existsSync(transcodedPath())).toBe(false); // cleaned up
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio throws a setup-guidance error when WHISPER_MODEL_PATH isn't configured, without downloading or spawning anything", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "";
  try {
    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/WHISPER_MODEL_PATH is not set/);
    expect(fetch).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio throws when the file-storage download fails", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(transcribeAudio(`${config.fileStorageBaseUrl}/files/missing.wav`)).rejects.toThrow(/Could not download audio.*404/);
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio throws when ffmpeg exits non-zero, without ever running whisper-cli", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    mockDownload();
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("unsupported codec"));
        child.emit("close", 1);
      });
      return child as never;
    });

    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/ffmpeg exited with code 1: unsupported codec/);
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio throws when whisper-cli exits non-zero", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    mockDownload();
    mockFfmpegSuccess();
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("model not found"));
        child.emit("close", 1);
      });
      return child as never;
    });

    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/exited with code 1: model not found/);
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio throws when whisper-cli can't be started", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    mockDownload();
    mockFfmpegSuccess();
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = fakeChild();
      queueMicrotask(() => child.emit("error", new Error("ENOENT")));
      return child as never;
    });

    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/Failed to start whisper-cli/);
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio times out and kills the child process past transcribeTimeoutMs", async () => {
  const originalModel = config.whisperModelPath;
  const originalTimeout = config.transcribeTimeoutMs;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  (config as { transcribeTimeoutMs: number }).transcribeTimeoutMs = 20;
  let capturedChild: FakeChild | undefined;
  try {
    mockDownload();
    mockFfmpegSuccess();
    vi.mocked(spawn).mockImplementationOnce(() => {
      capturedChild = fakeChild();
      return capturedChild as never;
    });

    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/timed out/);
    expect(capturedChild!.kill).toHaveBeenCalledWith("SIGKILL");
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = originalModel;
    (config as { transcribeTimeoutMs: number }).transcribeTimeoutMs = originalTimeout;
  }
});

test("transcribeAudio rejects URLs that are not file-storage file URLs without fetching them", async () => {
  const original = config.whisperModelPath;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  try {
    await expect(transcribeAudio("https://example.com/private")).rejects.toThrow(/Invalid file-storage audio URL/);
    expect(fetch).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = original;
  }
});

test("transcribeAudio kills ffmpeg when audio transcoding times out", async () => {
  const originalModel = config.whisperModelPath;
  const originalTimeout = config.transcribeTimeoutMs;
  (config as { whisperModelPath: string }).whisperModelPath = "/models/ggml-tiny.en.bin";
  (config as { transcribeTimeoutMs: number }).transcribeTimeoutMs = 20;
  let capturedChild: FakeChild | undefined;
  try {
    mockDownload();
    vi.mocked(spawn).mockImplementationOnce(() => {
      capturedChild = fakeChild();
      return capturedChild as never;
    });

    await expect(transcribeAudio(clipUrl())).rejects.toThrow(/Audio transcoding timed out/);
    expect(capturedChild!.kill).toHaveBeenCalledWith("SIGKILL");
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally {
    (config as { whisperModelPath: string }).whisperModelPath = originalModel;
    (config as { transcribeTimeoutMs: number }).transcribeTimeoutMs = originalTimeout;
  }
});
