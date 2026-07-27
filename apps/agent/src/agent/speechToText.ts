/**
 * Voice input: local speech-to-text via the whisper-cpp CLI (`whisper-cli`),
 * decoupled from the orchestrator model. Ollama has no audio-input support
 * for any model yet (confirmed via its issue tracker as of this writing), so
 * this transcribes to plain text before the model ever sees it — works
 * regardless of which orchestrator model is selected, and if Ollama ever
 * ships real audio input, that would be an alternate/pluggable path, not a
 * replacement for this one.
 *
 * `whisper-cli -nt -np` prints exactly one clean line of transcript to
 * stdout; all of its (very noisy) GGML/Metal backend diagnostics go to
 * stderr, so no output-scraping/ANSI-stripping is needed (confirmed live).
 *
 * Browser-recorded audio is transcoded via ffmpeg to 16kHz mono WAV first —
 * confirmed live that whisper-cli's bundled decoder (flac/mp3/ogg/wav only)
 * cannot read the audio/webm+opus MediaRecorder produces by default in Chrome.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function scratchDir(): string {
  return path.join(config.dataDir, "transcribe-tmp");
}

function runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
  const argv = ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-f", "wav", outputPath];
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Audio transcoding timed out after ${config.transcribeTimeoutMs}ms.`));
    }, config.transcribeTimeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim() || "(no stderr)"}`));
      else resolve();
    });
  });
}

async function runWhisperCli(filePath: string): Promise<string> {
  const argv = ["-m", config.whisperModelPath, "-f", filePath, "-nt", "-np"];

  return new Promise((resolve, reject) => {
    // stdin MUST be closed ("ignore"), matching imageGen.ts's ollama-CLI precedent —
    // execFile's stdio option is silently ignored, so spawn is required here too.
    const child = spawn(config.whisperCliPath, argv, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Transcription timed out after ${config.transcribeTimeoutMs}ms.`));
    }, config.transcribeTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start whisper-cli: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`whisper-cli exited with code ${code}: ${stderr.trim() || "(no stderr)"}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Extracts the opaque file-storage filename from a public file URL. The
 * caller-provided host is intentionally ignored: downloads always go through
 * the configured internal file-storage base URL, preventing /transcribe from
 * becoming an arbitrary server-side URL fetcher.
 */
function filenameFromFileStorageUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid file-storage audio URL.");
  }

  const match = url.pathname.match(/\/files\/([^/]+)$/);
  if (!match?.[1]) throw new Error("Invalid file-storage audio URL.");

  let filename: string;
  try {
    filename = decodeURIComponent(match[1]);
  } catch {
    throw new Error("Invalid file-storage audio URL.");
  }
  // File-storage itself generates UUID-based names. Keep this boundary strict
  // so the scratch path can never escape its directory.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename)) {
    throw new Error("Invalid file-storage audio URL.");
  }
  return filename;
}

async function downloadToScratch(fileUrl: string, dir: string): Promise<string> {
  const filename = filenameFromFileStorageUrl(fileUrl);
  const internalUrl = `${config.fileStorageBaseUrl}/files/${encodeURIComponent(filename)}`;
  const res = await fetch(internalUrl, { signal: AbortSignal.timeout(config.transcribeTimeoutMs) });
  if (!res.ok) throw new Error(`Could not download audio from file-storage: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

/** Downloads a file-storage audio URL and transcribes it to plain text. */
export async function transcribeAudio(fileUrl: string): Promise<string> {
  if (!config.whisperModelPath) {
    throw new Error(
      "Voice input isn't set up yet: WHISPER_MODEL_PATH is not set. Download a ggml-*.bin model (see docs/setup.md) and set the env var.",
    );
  }

  const dir = scratchDir();
  await fs.mkdir(dir, { recursive: true });

  const filePath = await downloadToScratch(fileUrl, dir);
  const wavPath = `${filePath}.transcode.wav`;
  try {
    await runFfmpeg(filePath, wavPath);
    return await runWhisperCli(wavPath);
  } finally {
    await fs.rm(filePath, { force: true });
    await fs.rm(wavPath, { force: true });
  }
}
