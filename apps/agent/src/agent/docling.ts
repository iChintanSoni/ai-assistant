/**
 * Document parsing via the Docling CLI (Python, external to this process).
 *
 * Docling is not an npm dependency — it's invoked as a subprocess, the same
 * way imageGen.ts shells out to the Ollama CLI for a capability Node doesn't
 * have natively. It accepts a URL as its input source directly (confirmed:
 * `docling <url> --to json ...` fetches it), so the raw upload never has to
 * pass through this process — it stays in apps/file-storage and Docling reads
 * it from there. `--to json` emits a structured `DoclingDocument` with a
 * reading-order tree (`body.children`, possibly nested through `groups`) and
 * per-element page provenance; `--image-export-mode referenced` additionally
 * writes each embedded figure to a PNG file instead of inlining it as base64.
 *
 * Uses `spawn`, not `execFile`, for the same reason as imageGen.ts: explicit
 * control over stdio matters for long-running child processes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export interface DoclingProv {
  page_no: number;
}

export interface DoclingTextItem {
  self_ref: string;
  label: string;
  text: string;
  prov: DoclingProv[];
}

export interface DoclingTableCell {
  text: string;
  row_span: number;
  col_span: number;
  start_row_offset_idx: number;
  end_row_offset_idx: number;
  start_col_offset_idx: number;
  end_col_offset_idx: number;
  column_header: boolean;
  row_header: boolean;
}

export interface DoclingTableItem {
  self_ref: string;
  label: string;
  prov: DoclingProv[];
  data: { table_cells: DoclingTableCell[] };
}

export interface DoclingPictureItem {
  self_ref: string;
  label: string;
  prov: DoclingProv[];
  image?: { mimetype: string; uri: string };
  captions: unknown[];
}

export interface DoclingGroup {
  self_ref: string;
  children: { $ref: string }[];
}

export interface DoclingBody {
  self_ref: string;
  children: { $ref: string }[];
}

export interface DoclingDocument {
  schema_name: string;
  texts: DoclingTextItem[];
  tables: DoclingTableItem[];
  pictures: DoclingPictureItem[];
  groups: DoclingGroup[];
  body: DoclingBody;
  pages: Record<string, { size: { width: number; height: number }; image?: { mimetype: string; uri: string } }>;
}

export interface ConvertedDocument {
  doc: DoclingDocument;
  /** Directory containing any figure PNGs referenced by doc.pictures[].image.uri. */
  artifactsDir: string;
}

function scratchDir(id: string): string {
  return path.join(config.dataDir, "document-ingest-tmp", id);
}

async function runDoclingCli(sourceUrl: string, outDir: string): Promise<void> {
  const argv = [sourceUrl, "--to", "json", "--image-export-mode", "referenced", "--output", outDir];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.doclingCliPath, argv, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stdout.on("data", () => {}); // Docling's JSON goes to a file, not stdout; nothing to capture.
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Docling conversion timed out after ${config.documentIngestTimeoutMs}ms.`));
    }, config.documentIngestTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to start the Docling CLI at "${config.doclingCliPath}": ${err.message}. ` +
            `Set DOCLING_CLI_PATH if it's installed somewhere else.`,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`docling exited with code ${code}: ${stderr.trim() || "(no stderr)"}`));
        return;
      }
      resolve();
    });
  });
}

/** Convert a file-storage URL into a parsed DoclingDocument + its extracted figure PNGs. */
export async function convertDocument(sourceUrl: string, id: string): Promise<ConvertedDocument> {
  const outDir = scratchDir(id);
  await fs.mkdir(outDir, { recursive: true });

  await runDoclingCli(sourceUrl, outDir);

  const entries = await fs.readdir(outDir);
  const jsonFile = entries.find((f) => f.endsWith(".json"));
  if (!jsonFile) {
    throw new Error(`Docling did not produce a JSON output file in ${outDir} (found: ${entries.join(", ") || "nothing"}).`);
  }

  const raw = await fs.readFile(path.join(outDir, jsonFile), "utf8");
  const doc = JSON.parse(raw) as DoclingDocument;
  return { doc, artifactsDir: outDir };
}

/** Best-effort cleanup of the scratch dir once figures have been uploaded elsewhere. */
export async function cleanupConversion(id: string): Promise<void> {
  await fs.rm(scratchDir(id), { recursive: true, force: true });
}
