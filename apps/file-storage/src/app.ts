/** Express app: upload endpoint + metadata-backed file serving for generated/uploaded artifacts. */
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { deleteFile, getFile, insertFile, listFiles } from "./store.js";
import { detectAllowedMime } from "./validate.js";

/**
 * Files written before the metadata store existed have no DB row, so the
 * metadata-driven /files/:filename route would 404 them. Adopt them in place
 * on startup: sniff their real mimetype and backfill a row from their disk stat.
 */
async function backfillExistingFiles(storageDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(storageDir);
  } catch {
    return;
  }
  for (const filename of entries) {
    if (getFile(filename)) continue;
    const filePath = path.join(storageDir, filename);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;
      const buffer = await fs.promises.readFile(filePath);
      const mimeType = await detectAllowedMime(buffer, "");
      if (!mimeType) continue; // leave unrecognized pre-existing files alone rather than guess
      insertFile({
        filename,
        originalName: filename.replace(/^[0-9a-f-]{36}-/, "") || filename,
        mimeType,
        size: stat.size,
        createdAt: stat.birthtimeMs || stat.mtimeMs,
      });
    } catch {
      // skip; a failed backfill just leaves that one file unservable, not a startup crash
    }
  }
}

export async function buildApp(): Promise<Express> {
  const corsOrigin = config.corsOrigin === "*" ? "*" : config.corsOrigin.split(",").map((s) => s.trim());
  const app = express();
  app.use(cors({ origin: corsOrigin }));

  const storageDir = path.resolve(process.cwd(), config.storageDir);
  fs.mkdirSync(storageDir, { recursive: true });
  await backfillExistingFiles(storageDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storageDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      cb(null, `${uuidv4()}-${safeName}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const filePath = path.join(storageDir, req.file.filename);
    try {
      // Verify the bytes actually on disk, never the client's Content-Type claim.
      const buffer = await fs.promises.readFile(filePath);
      const mimeType = await detectAllowedMime(buffer, req.file.mimetype);
      if (!mimeType) {
        await fs.promises.rm(filePath, { force: true });
        res.status(415).json({ error: "Unsupported or unrecognized file type" });
        return;
      }

      const meta = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType,
        size: req.file.size,
        createdAt: Date.now(),
      };
      insertFile(meta);

      res.status(201).json({
        url: `${config.baseUrl}/files/${meta.filename}`,
        filename: meta.filename,
        size: meta.size,
        mimetype: meta.mimeType,
      });
    } catch (err) {
      await fs.promises.rm(filePath, { force: true });
      res.status(500).json({ error: err instanceof Error ? err.message : "Upload processing failed" });
    }
  });

  // Metadata list for the agent's orphan-file reconciliation (see agent/fileCleanup.ts).
  app.get("/files", (_req, res) => {
    res.json({ files: listFiles() });
  });

  app.get("/files/:filename", (req, res) => {
    const meta = getFile(req.params.filename);
    if (!meta) {
      res.status(404).end();
      return;
    }
    res.set({
      "Content-Type": meta.mimeType,
      "Content-Disposition": `inline; filename="${meta.originalName.replace(/[":]/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
      // Files are meant to be publicly loadable (<img>, <audio>) regardless of CORS_ORIGIN.
      "Access-Control-Allow-Origin": "*",
    });
    // `root` matters here, not just for containment: `send` treats any path
    // segment starting with "." as a dotfile and 404s it — and STORAGE_DIR
    // defaults to "./.storage", so an absolute joined path would trip that
    // check on the directory name itself. `root` scopes the check to `filename` only.
    res.sendFile(meta.filename, { root: storageDir }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  app.delete("/files/:filename", async (req, res) => {
    const meta = getFile(req.params.filename);
    if (!meta) {
      res.status(404).end();
      return;
    }
    await fs.promises.rm(path.join(storageDir, meta.filename), { force: true });
    deleteFile(meta.filename);
    res.status(204).end();
  });

  return app;
}
