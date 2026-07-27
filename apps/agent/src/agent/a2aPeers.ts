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
import type { Message, Part, Task } from "@a2a-js/sdk";
import { config } from "../config.js";

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
  return parts.map((p) => (p.kind === "text" ? p.text : "")).join("");
}

async function delegate(peer: A2APeer, task: string): Promise<string> {
  const client = await new ClientFactory().createFromUrl(peer.url);
  const message: Message = {
    kind: "message",
    role: "user",
    messageId: randomUUID(),
    parts: [{ kind: "text", text: task }],
  };
  const result = await client.sendMessage({ message });

  if (result.kind === "message") return textFromParts(result.parts) || "(empty reply)";

  // Otherwise it's a Task — mirrors the status-update text extraction the
  // frontend does in useChat.ts's handleEvent.
  const status = (result as Task).status;
  const text = textFromParts(status.message?.parts ?? []);
  if (status.state !== "completed" && !text) {
    return `Peer agent "${peer.name}" did not return a completed result (state: ${status.state}). It may require human approval on its own end, which this orchestrator cannot resolve on its behalf.`;
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
