/** Durable, local conversation state (threads + paused HITL interrupts). */
import fs from "node:fs";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { config } from "../config.js";

let saver: SqliteSaver | undefined;

export function getCheckpointer(): SqliteSaver {
  if (!saver) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    saver = SqliteSaver.fromConnString(path.join(config.dataDir, "checkpoints.db"));
  }
  return saver;
}
