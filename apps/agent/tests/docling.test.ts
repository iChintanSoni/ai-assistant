import { EventEmitter } from "node:events";
import fs, { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { cleanupConversion, convertDocument } from "../src/agent/docling.js";

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

function outDirFromArgv(argv: string[]): string {
  return argv[argv.indexOf("--output") + 1]!;
}

beforeEach(() => {
  vi.mocked(spawn).mockReset();
});

test("convertDocument parses the JSON file Docling wrote to the output dir", async () => {
  vi.mocked(spawn).mockImplementation((_cmd, argv) => {
    const outDir = outDirFromArgv(argv as string[]);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "doc.json"), JSON.stringify({ schema_name: "DoclingDocument", texts: [] }));
    const child = fakeChild();
    queueMicrotask(() => child.emit("close", 0));
    return child as never;
  });

  const result = await convertDocument("http://files/1.pdf", "doc-1");
  expect(result.doc.schema_name).toBe("DoclingDocument");
  expect(existsSync(result.artifactsDir)).toBe(true);
});

test("convertDocument rejects when Docling exits non-zero", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    queueMicrotask(() => {
      child.stderr.emit("data", Buffer.from("boom"));
      child.emit("close", 1);
    });
    return child as never;
  });

  await expect(convertDocument("http://files/1.pdf", "doc-2")).rejects.toThrow(/exited with code 1: boom/);
});

test("convertDocument rejects when the CLI can't be started", async () => {
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child as never;
  });

  await expect(convertDocument("http://files/1.pdf", "doc-3")).rejects.toThrow(/Failed to start the Docling CLI/);
});

test("convertDocument rejects when Docling exits 0 but writes no JSON file", async () => {
  vi.mocked(spawn).mockImplementation((_cmd, argv) => {
    const outDir = outDirFromArgv(argv as string[]);
    fs.mkdirSync(outDir, { recursive: true });
    const child = fakeChild();
    queueMicrotask(() => child.emit("close", 0));
    return child as never;
  });

  await expect(convertDocument("http://files/1.pdf", "doc-4")).rejects.toThrow(/did not produce a JSON output file/);
});

test("convertDocument times out and kills the child process past documentIngestTimeoutMs", async () => {
  // config isn't runtime-frozen (only `as const` at the type level), so temporarily
  // shrinking the timeout lets this run against a real (tiny) timer instead of racing
  // fake timers against convertDocument's real `await fs.mkdir(...)` up front.
  const original = config.documentIngestTimeoutMs;
  (config as { documentIngestTimeoutMs: number }).documentIngestTimeoutMs = 20;
  let capturedChild: FakeChild | undefined;
  vi.mocked(spawn).mockImplementation(() => {
    capturedChild = fakeChild();
    return capturedChild as never;
  });

  try {
    await expect(convertDocument("http://files/1.pdf", "doc-5")).rejects.toThrow(/timed out/);
    expect(capturedChild!.kill).toHaveBeenCalledWith("SIGKILL");
  } finally {
    (config as { documentIngestTimeoutMs: number }).documentIngestTimeoutMs = original;
  }
});

test("cleanupConversion removes the scratch directory without throwing if it's already gone", async () => {
  await expect(cleanupConversion("never-existed")).resolves.toBeUndefined();
});
