/** Runtime configuration, read once from the environment (see .env.example). */
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 6060);

export const config = {
  host,
  port,
  // Directory where uploaded/generated files are stored on disk.
  storageDir: process.env.STORAGE_DIR ?? "./.storage",
  // SQLite file holding per-upload metadata (verified mimetype, size, original name).
  dbPath: process.env.DB_PATH ?? "./file-storage.db",
  // Public base URL used to build download links returned by /upload.
  baseUrl: process.env.BASE_URL ?? `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
  // Comma-separated allowed CORS origins, or "*" for local dev.
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
} as const;

export type Config = typeof config;
