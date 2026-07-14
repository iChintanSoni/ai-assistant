/**
 * Image generation via the Ollama CLI.
 *
 * Ollama's REST /api/generate does not yet support image-generation models
 * (confirmed: it returns HTTP 500 "unexpected EOF" against x/z-image-turbo on
 * 0.31.2) so this shells out to `ollama run`, which supports one-shot flags
 * (--width/--height/--negative/--seed) even outside the interactive REPL.
 * The CLI prints a noisy progress bar but always ends with a plain
 * "Image saved to: <file>.png" line once done.
 *
 * Uses `spawn`, not `execFile`: `ollama run`'s image-generation path hangs
 * indefinitely (never even reaches the daemon, confirmed via `ollama ps`)
 * if its stdin is left as an open, unread pipe. `execFile`'s `stdio` option
 * is silently ignored (it always forces piped stdio for its callback-based
 * buffering, per Node's own behavior), so closing stdin requires `spawn`
 * with an explicit `stdio: ["ignore", ...]`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getImageGenModel } from "./models.js";

export interface ImageGenArgs {
  prompt: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
  seed?: number;
}

function scratchDir(): string {
  return path.join(config.dataDir, "image-gen-tmp");
}

const ANSI_ESCAPE_RE = /\x1B(?:\[[0-9;?]*[a-zA-Z]|\][^\x07]*\x07)/g;

function parseSavedFilename(output: string): string | null {
  const clean = output.replace(ANSI_ESCAPE_RE, "");
  const match = clean.match(/Image saved to:\s*(\S.*\.png)\s*$/m);
  return match?.[1]?.trim() ?? null;
}

async function runOllamaCli(args: ImageGenArgs, cwd: string): Promise<string> {
  const argv = ["run", getImageGenModel(), args.prompt];
  if (args.width) argv.push("--width", String(args.width));
  if (args.height) argv.push("--height", String(args.height));
  if (args.negativePrompt) argv.push("--negative", args.negativePrompt);
  if (args.seed !== undefined) argv.push("--seed", String(args.seed));

  return new Promise((resolve, reject) => {
    // stdin MUST be closed ("ignore"), not left open — see the module comment.
    const child = spawn(config.ollamaCliPath, argv, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Image generation timed out after ${config.imageGenTimeoutMs}ms.`));
    }, config.imageGenTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start ollama CLI: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ollama run exited with code ${code}: ${stderr.trim() || "(no stderr)"}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function uploadToFileStorage(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), path.basename(filePath));

  const res = await fetch(`${config.fileStorageBaseUrl}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`file-storage upload failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("file-storage upload response missing url");
  return data.url;
}

/** Generate an image and return its publicly reachable URL. */
export async function generateImage(args: ImageGenArgs): Promise<string> {
  const dir = scratchDir();
  await fs.mkdir(dir, { recursive: true });

  const stdout = await runOllamaCli(args, dir);
  const filename = parseSavedFilename(stdout);
  if (!filename) {
    throw new Error("Could not find a generated image in the Ollama CLI output.");
  }

  const filePath = path.join(dir, filename);
  try {
    return await uploadToFileStorage(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}
