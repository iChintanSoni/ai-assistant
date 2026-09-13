/**
 * Peer A2A agents this agent can delegate to — the "stand up a specialized
 * agent" tier of the capability architecture (see docs/architecture.md), for
 * capabilities that need their own multi-turn reasoning loop rather than a
 * single stateless tool call. Declared in config/a2a-peers.json (empty by
 * default): registering a peer is a JSON edit, not new orchestrator code.
 * Each peer gets one delegate_to_<name> tool that sends it a message over
 * A2A (the same protocol/client the frontend uses — see apps/frontend/src/lib/a2a.ts)
 * and returns its final text reply.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ClientFactory } from "@a2a-js/sdk/client";
import { Role, TaskState, type Message, type Part, type Task } from "@a2a-js/sdk";
import { config } from "../config.js";
import { textPart } from "./parts.js";

export interface A2APeer {
  /** Used to name its tool (delegate_to_<name>) — keep it a valid identifier fragment. */
  name: string;
  /** Folded into the tool description so the orchestrator knows when to delegate to it. */
  description: string;
  url: string;
}

function readPeers(): A2APeer[] {
  if (!fs.existsSync(config.a2aPeersConfigPath)) return [];
  return JSON.parse(fs.readFileSync(config.a2aPeersConfigPath, "utf8")) as A2APeer[];
}

function textFromParts(parts: Part[]): string {
  return parts.map((p) => (p.content?.$case === "text" ? p.content.value : "")).join("");
}

/** `SendMessageResult = Message | Task` — only Message has `messageId`. */
function isMessage(result: Message | Task): result is Message {
  return "messageId" in result;
}

async function delegate(peer: A2APeer, task: string): Promise<string> {
  const client = await new ClientFactory().createFromUrl(peer.url);
  const message: Message = {
    messageId: randomUUID(),
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [textPart(task)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
  const result = await client.sendMessage({ tenant: "", message, configuration: undefined, metadata: undefined });

  if (isMessage(result)) return textFromParts(result.parts) || "(empty reply)";

  // Otherwise it's a Task — mirrors the status-update text extraction the
  // frontend does in useChat.ts's handleEvent.
  const status = result.status;
  const text = textFromParts(status?.message?.parts ?? []);
  if (status?.state !== TaskState.TASK_STATE_COMPLETED && !text) {
    return `Peer agent "${peer.name}" did not return a completed result (state: ${status ? TaskState[status.state] : "unknown"}). It may require human approval on its own end, which this orchestrator cannot resolve on its behalf.`;
  }
  return text || "(empty reply)";
}

/** One delegate_to_<name> tool per configured peer. Empty list -> empty array, fully inert. */
export function getA2APeerTools() {
  return readPeers().map((peer) =>
    tool(
      async ({ task }) => {
        try {
          return await delegate(peer, task);
        } catch (err) {
          return `Delegation to "${peer.name}" failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
      {
        name: `delegate_to_${peer.name}`,
        description: `Delegate a task to the "${peer.name}" peer agent. ${peer.description}`,
        schema: z.object({ task: z.string().describe("The task or question to send to this peer agent") }),
      },
    ),
  );
}
