import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { generateImage } from "../src/agent/imageGen.js";

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

const scratchDir = () => path.join(config.dataDir, "image-gen-tmp");

beforeEach(() => {
  vi.mocked(spawn).mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("generateImage parses the saved filename, uploads it, and cleans up the local file", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    fs.mkdirSync(scratchDir(), { recursive: true });
    fs.writeFileSync(path.join(scratchDir(), "out-1.png"), Buffer.from([1, 2, 3]));
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("Rendering...\nImage saved to: out-1.png\n"));
      child.emit("close", 0);
    });
    return child as never;
  });
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/out-1.png" }), { status: 200 }));

  const url = await generateImage({ prompt: "a fox" });

  expect(url).toBe("http://files/out-1.png");
  expect(fs.existsSync(path.join(scratchDir(), "out-1.png"))).toBe(false); // cleaned up
});

test("generateImage passes width/height/negativePrompt/seed through as CLI flags", async () => {
  vi.mocked(spawn).mockImplementation((_cmd, argv) => {
    expect(argv).toEqual([
      "run",
      config.imageGenModel,
      "a fox",
      "--width",
      "512",
      "--height",
      "512",
      "--negative",
      "blurry",
      "--seed",
      "7",
    ]);
    fs.mkdirSync(scratchDir(), { recursive: true });
    fs.writeFileSync(path.join(scratchDir(), "out-2.png"), Buffer.from([1]));
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("Image saved to: out-2.png\n"));
      child.emit("close", 0);
    });
    return child as never;
  });
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/out-2.png" }), { status: 200 }));

  await generateImage({ prompt: "a fox", width: 512, height: 512, negativePrompt: "blurry", seed: 7 });
});

test("generateImage strips ANSI escape codes before matching the saved-filename line", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    fs.mkdirSync(scratchDir(), { recursive: true });
    fs.writeFileSync(path.join(scratchDir(), "out-3.png"), Buffer.from([1]));
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("\x1b[2K\x1b[1GImage saved to: out-3.png\x1b[0m\n"));
      child.emit("close", 0);
    });
    return child as never;
  });
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: "http://files/out-3.png" }), { status: 200 }));

  await expect(generateImage({ prompt: "x" })).resolves.toBe("http://files/out-3.png");
});

test("generateImage throws when the CLI output has no 'Image saved to:' line", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("no idea what happened\n"));
      child.emit("close", 0);
    });
    return child as never;
  });

  await expect(generateImage({ prompt: "x" })).rejects.toThrow(/Could not find a generated image/);
});

test("generateImage throws when the CLI exits non-zero", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    queueMicrotask(() => {
      child.stderr.emit("data", Buffer.from("model not found"));
      child.emit("close", 1);
    });
    return child as never;
  });

  await expect(generateImage({ prompt: "x" })).rejects.toThrow(/exited with code 1: model not found/);
});

test("generateImage throws when the CLI can't be started", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child as never;
  });

  await expect(generateImage({ prompt: "x" })).rejects.toThrow(/Failed to start ollama CLI/);
});

test("generateImage throws when the upload to file-storage fails", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    fs.mkdirSync(scratchDir(), { recursive: true });
    fs.writeFileSync(path.join(scratchDir(), "out-4.png"), Buffer.from([1]));
    const child = fakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("Image saved to: out-4.png\n"));
      child.emit("close", 0);
    });
    return child as never;
  });
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

  await expect(generateImage({ prompt: "x" })).rejects.toThrow(/file-storage upload failed/);
});

test("generateImage times out and kills the child process past imageGenTimeoutMs", async () => {
  // config isn't runtime-frozen (only `as const` at the type level), so temporarily
  // shrinking the timeout lets this run against a real (tiny) timer.
  const original = config.imageGenTimeoutMs;
  (config as { imageGenTimeoutMs: number }).imageGenTimeoutMs = 20;
  let capturedChild: FakeChild | undefined;
  vi.mocked(spawn).mockImplementation(() => {
    capturedChild = fakeChild();
    return capturedChild as never;
  });

  try {
    await expect(generateImage({ prompt: "x" })).rejects.toThrow(/timed out/);
    expect(capturedChild!.kill).toHaveBeenCalledWith("SIGKILL");
  } finally {
    (config as { imageGenTimeoutMs: number }).imageGenTimeoutMs = original;
  }
});
