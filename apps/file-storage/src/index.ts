import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[file-storage] listening on ${config.baseUrl} (uploads: ${config.baseUrl}/upload)`);
});

function shutdown(signal: string): void {
  console.log(`[file-storage] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
