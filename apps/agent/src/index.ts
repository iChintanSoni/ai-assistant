/** Entrypoint: start the A2A deep-agent server. */
import { buildApp } from "./server/app.js";
import { startFileCleanup } from "./agent/fileCleanup.js";
import { reconcileStuckDocuments } from "./agent/documentIngest.js";
import { config } from "./config.js";

const app = buildApp();
startFileCleanup();
reconcileStuckDocuments();

const server = app.listen(config.port, () => {
  console.log(`[agent] Aurora A2A server listening on ${config.publicUrl}`);
  console.log(`[agent]   agent card : ${config.publicUrl}/.well-known/agent-card.json`);
  console.log(`[agent]   json-rpc   : ${config.publicUrl}/a2a`);
  console.log(`[agent]   models     : ${config.publicUrl}/models`);
  console.log(`[agent]   ollama     : ${config.ollamaBaseUrl} (default model: ${config.defaultModel})`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[agent] Port ${config.port} is already in use. Set PORT to a free port and retry.`);
  } else {
    console.error(`[agent] Server error:`, err);
  }
  process.exit(1);
});
