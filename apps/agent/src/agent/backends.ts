/**
 * Backend: thread-scoped state by default, but `/memories/` routes to durable
 * on-disk storage so the agent remembers facts ACROSS conversations/sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { CompositeBackend, FilesystemBackend, StateBackend } from "deepagents";
import { config } from "../config.js";

export function buildBackend() {
  const memoriesDir = path.join(config.dataDir, "memories");
  fs.mkdirSync(memoriesDir, { recursive: true });
  return new CompositeBackend(new StateBackend(), {
    "/memories/": new FilesystemBackend({ rootDir: memoriesDir, virtualMode: true }),
  });
}
