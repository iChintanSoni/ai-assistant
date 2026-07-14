/** Orchestrates a send / resume: builds the A2A message, streams events, drives the store. */
import { useCallback } from "react";
import type {
  FilePart,
  Message,
  Part,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
  TextPart,
} from "@a2a-js/sdk";
import { getClient } from "../lib/a2a";
import { isEnvelope, type Decision } from "../lib/envelope";
import { saveConversation } from "../lib/history";
import { uploadFile } from "../lib/upload";
import { useChatStore, type UIAttachment } from "../store/chat";

type A2AEvent = Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

function textFromParts(parts: Part[]): string {
  return parts.map((p) => (p.kind === "text" ? p.text : "")).join("");
}

function handleEvent(event: A2AEvent): void {
  const store = useChatStore.getState();

  if (event.kind === "task") {
    store.setActiveTask(event.id, event.contextId);
    return;
  }

  if (event.kind === "status-update") {
    const parts = event.status.message?.parts ?? [];
    let finalText = "";
    for (const p of parts) {
      if (p.kind === "data" && isEnvelope(p.data)) store.applyEnvelope(p.data);
      else if (p.kind === "text") finalText += p.text;
    }
    switch (event.status.state) {
      case "completed":
        store.finishTurn("complete", finalText || undefined);
        break;
      case "canceled":
        store.finishTurn("canceled");
        break;
      case "failed":
        store.finishTurn("failed", undefined, finalText || "The agent failed.");
        break;
      case "input-required":
        store.pauseForApproval();
        break;
    }
    return;
  }

  if (event.kind === "message") {
    store.finishTurn("complete", textFromParts(event.parts) || undefined);
  }
}

/** Best-effort: persist the current transcript so it shows up in History. Never throws. */
function persistConversation(): void {
  const { contextId, selectedModel, turns } = useChatStore.getState();
  if (!contextId || !selectedModel || turns.length === 0) return;
  saveConversation(contextId, selectedModel, turns).catch((err) => {
    console.error("Failed to save conversation:", err);
  });
}

async function streamMessage(message: Message): Promise<void> {
  try {
    const client = await getClient();
    for await (const event of client.sendMessageStream({ message })) {
      handleEvent(event as A2AEvent);
    }
  } catch (err) {
    useChatStore
      .getState()
      .finishTurn("failed", undefined, err instanceof Error ? err.message : String(err));
  } finally {
    persistConversation();
  }
}

export function useChat() {
  const send = useCallback(async (text: string, files: File[]) => {
    const store = useChatStore.getState();
    const model = store.selectedModel;
    if (!model || store.isStreaming) return;

    const parts: Part[] = [];
    if (text.trim()) parts.push({ kind: "text", text } satisfies TextPart);
    const attachments: UIAttachment[] = [];
    // Upload first, then reference by URL — never inline raw bytes into the
    // message or the persisted transcript.
    for (const f of files) {
      const uploaded = await uploadFile(f);
      parts.push({
        kind: "file",
        file: { uri: uploaded.url, mimeType: uploaded.mimetype, name: f.name },
      } satisfies FilePart);
      attachments.push({
        name: f.name,
        url: uploaded.url,
        mimeType: uploaded.mimetype,
        size: uploaded.size,
      });
    }
    if (parts.length === 0) return;

    store.beginTurn(text, attachments, store.activeDocumentIds);

    // Fire-and-forget: streamMessage handles its own errors (finishTurn("failed", ...)),
    // so callers only need to wait for the message to be dispatched, not for the whole
    // response to finish streaming back.
    void streamMessage({
      kind: "message",
      role: "user",
      messageId: crypto.randomUUID(),
      parts,
      metadata: {
        model,
        ...(store.activeDocumentIds.length > 0 ? { documentIds: store.activeDocumentIds } : {}),
      },
      ...(store.contextId ? { contextId: store.contextId } : {}),
    });
  }, []);

  const respond = useCallback(async (decisions: Decision[]) => {
    const store = useChatStore.getState();
    const taskId = store.pendingTaskId;
    const model = store.selectedModel;
    if (!taskId || !model) return;

    store.resumeForDecision();

    await streamMessage({
      kind: "message",
      role: "user",
      messageId: crypto.randomUUID(),
      taskId,
      parts: [{ kind: "data", data: { type: "decision", decisions } }],
      metadata: { model },
      ...(store.contextId ? { contextId: store.contextId } : {}),
    });
  }, []);

  const stop = useCallback(async () => {
    const { activeTaskId } = useChatStore.getState();
    if (!activeTaskId) return;
    try {
      const client = await getClient();
      await client.cancelTask({ id: activeTaskId });
    } catch {
      // best-effort; the stream will still surface a terminal state
    }
  }, []);

  return { send, respond, stop };
}
