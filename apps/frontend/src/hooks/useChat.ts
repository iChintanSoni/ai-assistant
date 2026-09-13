/** Orchestrates a send / resume: builds the A2A message, streams events, drives the store. */
import { useCallback } from "react";
import { Role, TaskState, type Message, type Part, type StreamResponse } from "@a2a-js/sdk";
import { getClient } from "../lib/a2a";
import { isEnvelope, type Decision } from "../lib/envelope";
import { saveConversation } from "../lib/history";
import { uploadFile } from "../lib/upload";
import { useChatStore, type UIAttachment } from "../store/chat";
import { randomUUID } from "../lib/uuid";

function textPart(text: string): Part {
  return { content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" };
}

function dataPart(data: unknown): Part {
  return { content: { $case: "data", value: data }, metadata: undefined, filename: "", mediaType: "application/json" };
}

function urlFilePart(url: string, mediaType: string, filename: string): Part {
  return { content: { $case: "url", value: url }, metadata: undefined, filename, mediaType };
}

function textFromParts(parts: Part[]): string {
  return parts.map((p) => (p.content?.$case === "text" ? p.content.value : "")).join("");
}

function handleEvent(event: StreamResponse): void {
  const store = useChatStore.getState();
  const payload = event.payload;
  if (!payload) return;

  if (payload.$case === "task") {
    store.setActiveTask(payload.value.id, payload.value.contextId);
    return;
  }

  if (payload.$case === "statusUpdate") {
    const status = payload.value.status;
    const parts = status?.message?.parts ?? [];
    let finalText = "";
    for (const p of parts) {
      if (p.content?.$case === "data" && isEnvelope(p.content.value)) store.applyEnvelope(p.content.value);
      else if (p.content?.$case === "text") finalText += p.content.value;
    }
    switch (status?.state) {
      case TaskState.TASK_STATE_COMPLETED:
        store.finishTurn("complete", finalText || undefined);
        break;
      case TaskState.TASK_STATE_CANCELED:
        store.finishTurn("canceled");
        break;
      case TaskState.TASK_STATE_FAILED:
        store.finishTurn("failed", undefined, finalText || "The agent failed.");
        break;
      case TaskState.TASK_STATE_INPUT_REQUIRED:
        store.pauseForApproval();
        break;
    }
    return;
  }

  if (payload.$case === "message") {
    store.finishTurn("complete", textFromParts(payload.value.parts) || undefined);
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
    for await (const event of client.sendMessageStream({ tenant: "", message, configuration: undefined, metadata: undefined })) {
      handleEvent(event);
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
    if (text.trim()) parts.push(textPart(text));
    const attachments: UIAttachment[] = [];
    // Upload first, then reference by URL — never inline raw bytes into the
    // message or the persisted transcript.
    for (const f of files) {
      const uploaded = await uploadFile(f);
      parts.push(urlFilePart(uploaded.url, uploaded.mimetype, f.name));
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
      messageId: randomUUID(),
      contextId: store.contextId ?? "",
      taskId: "",
      role: Role.ROLE_USER,
      parts,
      metadata: {
        model,
        ...(store.activeDocumentIds.length > 0 ? { documentIds: store.activeDocumentIds } : {}),
      },
      extensions: [],
      referenceTaskIds: [],
    });
  }, []);

  const respond = useCallback(async (decisions: Decision[]) => {
    const store = useChatStore.getState();
    const taskId = store.pendingTaskId;
    const model = store.selectedModel;
    if (!taskId || !model) return;

    store.resumeForDecision();

    await streamMessage({
      messageId: randomUUID(),
      contextId: store.contextId ?? "",
      taskId,
      role: Role.ROLE_USER,
      parts: [dataPart({ type: "decision", decisions })],
      metadata: { model },
      extensions: [],
      referenceTaskIds: [],
    });
  }, []);

  const stop = useCallback(async () => {
    const { activeTaskId } = useChatStore.getState();
    if (!activeTaskId) return;
    try {
      const client = await getClient();
      await client.cancelTask({ tenant: "", id: activeTaskId, metadata: undefined });
    } catch {
      // best-effort; the stream will still surface a terminal state
    }
  }, []);

  return { send, respond, stop };
}
