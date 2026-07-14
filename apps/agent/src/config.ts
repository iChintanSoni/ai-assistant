/** Runtime configuration, read once from the environment (see .env.example). */
const port = Number(process.env.PORT ?? 4000);

export const config = {
  port,
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, ""),
  defaultModel: process.env.DEFAULT_MODEL ?? "gemma4:12b",
  dataDir: process.env.DATA_DIR ?? "./data",
  // Sandboxed code execution (Deno, default-deny permissions).
  denoPath: process.env.DENO_PATH ?? "deno",
  sandboxTimeoutMs: Number(process.env.SANDBOX_TIMEOUT_MS ?? 10000),
  // Web search: Tavily when set, else keyless DuckDuckGo.
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  // Image generation: shells out to the Ollama CLI (no REST support yet for image models).
  ollamaCliPath: process.env.OLLAMA_CLI_PATH ?? "ollama",
  imageGenModel: process.env.IMAGE_GEN_MODEL ?? "x/z-image-turbo:latest",
  // Cold-start generation (model not already loaded) measured at ~100s locally;
  // give real headroom on top of that plus the file-storage upload.
  imageGenTimeoutMs: Number(process.env.IMAGE_GEN_TIMEOUT_MS ?? 240000),
  fileStorageBaseUrl: (process.env.FILE_STORAGE_BASE_URL ?? "http://localhost:6060").replace(/\/$/, ""),
  // Orphan file-storage sweep (startup + every 6h). Disable if you manage cleanup yourself.
  fileCleanupEnabled: process.env.FILE_CLEANUP_ENABLED !== "false",
  // Document ingestion: Docling (Python, external to this Node process) converts
  // uploads to structured JSON. Defaults to the pyenv 3.12.10 install where it was
  // confirmed present locally — override if your install lives elsewhere.
  doclingCliPath:
    process.env.DOCLING_CLI_PATH ?? `${process.env.HOME}/.pyenv/versions/3.12.10/bin/docling`,
  documentIngestTimeoutMs: Number(process.env.DOCUMENT_INGEST_TIMEOUT_MS ?? 180000),
  // Ollama embedding model for large-document chunk retrieval. Not pulled by default —
  // run `ollama pull nomic-embed-text` once locally before using documents chat.
  embeddingModel: process.env.EMBEDDING_MODEL ?? "nomic-embed-text",
  // Vision-capable model used to caption extracted figures/diagrams at ingest time.
  captionModel: process.env.CAPTION_MODEL ?? process.env.DEFAULT_MODEL ?? "gemma4:12b",
  // Documents whose extracted text fits this budget skip chunk embedding/retrieval
  // entirely and are answered from the full text directly (~4 chars/token estimate).
  smallDocTokenBudget: Number(process.env.SMALL_DOC_TOKEN_BUDGET ?? 6000),
  documentChunkTokenBudget: Number(process.env.DOCUMENT_CHUNK_TOKEN_BUDGET ?? 500),
  // Orchestrator numCtx is set to the model's real reported max context length by
  // default (see agent/models.ts). If a model's max is too large for local hardware
  // (Ollama allocates KV-cache for the full numCtx up front), set this to clamp it —
  // unset by default, so the full reported max is used as-is.
  maxContextTokens: process.env.MAX_CONTEXT_TOKENS ? Number(process.env.MAX_CONTEXT_TOKENS) : undefined,
} as const;

export type Config = typeof config;
