/** Conversation state: turns (with streamed reasoning/text/tools/approvals), model, ids. */
import { create } from "zustand";
import type { ModelInfo } from "../lib/models";
import type { ApprovalRequest, Envelope } from "../lib/envelope";

export type TurnStatus = "streaming" | "complete" | "canceled" | "failed" | "input-required";

export interface UIToolCall {
  id: string;
  name: string;
  args?: unknown;
  output?: unknown;
  status: "started" | "completed" | "error";
}

/** previewUrl is only set for image attachments: a file-storage URL, persisted as-is in history. */
export interface UIAttachment {
  name: string;
  previewUrl?: string;
}

export interface UITurn {
  id: string;
  role: "user" | "agent";
  text: string;
  reasoning: string;
  tools: UIToolCall[];
  status: TurnStatus;
  error?: string;
  /** Legacy persisted conversations stored these as plain filename strings. */
  attachments?: (UIAttachment | string)[];
  approvals?: ApprovalRequest[];
  subagents?: UIToolCall[];
}

interface ChatState {
  models: ModelInfo[];
  selectedModel: string | null;
  modelsError: string | null;
  contextId: string | null;
  activeTaskId: string | null;
  pendingTaskId: string | null;
  isStreaming: boolean;
  turns: UITurn[];
  /** Documents active in the current conversation — passed as tool-scope hints on send. */
  activeDocumentIds: string[];

  setModels: (models: ModelInfo[], defaultModel: string) => void;
  setModelsError: (message: string) => void;
  selectModel: (name: string) => void;
  newChat: () => void;
  loadConversation: (id: string, model: string, turns: UITurn[]) => void;
  addActiveDocument: (id: string) => void;
  removeActiveDocument: (id: string) => void;
  beginTurn: (userText: string, attachments: UIAttachment[]) => void;
  setActiveTask: (taskId: string, contextId: string) => void;
  applyEnvelope: (env: Envelope) => void;
  finishTurn: (status: TurnStatus, finalText?: string, error?: string) => void;
  pauseForApproval: () => void;
  resumeForDecision: () => void;
}

function mapLastAgent(turns: UITurn[], fn: (t: UITurn) => UITurn): UITurn[] {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t && t.role === "agent") {
      const next = turns.slice();
      next[i] = fn(t);
      return next;
    }
  }
  return turns;
}

function upsertTool(turn: UITurn, tc: UIToolCall): UITurn {
  const idx = turn.tools.findIndex((x) => x.id === tc.id);
  const tools = turn.tools.slice();
  if (idx >= 0) tools[idx] = { ...(tools[idx] as UIToolCall), ...tc };
  else tools.push(tc);
  return { ...turn, tools };
}

function upsertSubagent(turn: UITurn, id: string, patch: Partial<UIToolCall>): UITurn {
  const list = turn.subagents ?? [];
  const idx = list.findIndex((x) => x.id === id);
  const next = list.slice();
  if (idx >= 0) next[idx] = { ...(next[idx] as UIToolCall), ...patch, id };
  else next.push({ id, name: patch.name ?? "subagent", args: patch.args, output: patch.output, status: patch.status ?? "started" });
  return { ...turn, subagents: next };
}

export const useChatStore = create<ChatState>((set) => ({
  models: [],
  selectedModel: null,
  modelsError: null,
  contextId: null,
  activeTaskId: null,
  pendingTaskId: null,
  isStreaming: false,
  turns: [],
  activeDocumentIds: [],

  setModels: (models, defaultModel) =>
    set((s) => ({
      models,
      modelsError: null,
      selectedModel:
        s.selectedModel && models.some((m) => m.name === s.selectedModel)
          ? s.selectedModel
          : models.some((m) => m.name === defaultModel)
            ? defaultModel
            : (models[0]?.name ?? null),
    })),

  setModelsError: (message) => set({ modelsError: message }),

  selectModel: (name) => set({ selectedModel: name }),

  newChat: () =>
    set({
      turns: [],
      contextId: null,
      activeTaskId: null,
      pendingTaskId: null,
      isStreaming: false,
      activeDocumentIds: [],
    }),

  loadConversation: (id, model, turns) =>
    set({
      turns,
      contextId: id,
      selectedModel: model,
      activeTaskId: null,
      pendingTaskId: null,
      isStreaming: false,
      activeDocumentIds: [],
    }),

  addActiveDocument: (id) =>
    set((s) => (s.activeDocumentIds.includes(id) ? s : { activeDocumentIds: [...s.activeDocumentIds, id] })),

  removeActiveDocument: (id) => set((s) => ({ activeDocumentIds: s.activeDocumentIds.filter((d) => d !== id) })),

  beginTurn: (userText, attachments) =>
    set((s) => ({
      isStreaming: true,
      turns: [
        ...s.turns,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: userText,
          reasoning: "",
          tools: [],
          status: "complete",
          attachments,
        },
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: "",
          reasoning: "",
          tools: [],
          status: "streaming",
        },
      ],
    })),

  setActiveTask: (taskId, contextId) => set({ activeTaskId: taskId, contextId }),

  applyEnvelope: (env) =>
    set((s) => {
      switch (env.type) {
        case "reasoning":
          return env.delta
            ? { turns: mapLastAgent(s.turns, (t) => ({ ...t, reasoning: t.reasoning + env.delta })) }
            : {};
        case "text":
          return env.delta
            ? { turns: mapLastAgent(s.turns, (t) => ({ ...t, text: t.text + env.delta })) }
            : {};
        case "tool_call":
          return {
            turns: mapLastAgent(s.turns, (t) =>
              upsertTool(t, {
                id: env.id ?? crypto.randomUUID(),
                name: env.name ?? "tool",
                args: env.args,
                status: "started",
              }),
            ),
          };
        case "tool_result":
          return {
            turns: mapLastAgent(s.turns, (t) =>
              upsertTool(t, {
                id: env.id ?? crypto.randomUUID(),
                name: env.name ?? "tool",
                output: env.output,
                status: "completed",
              }),
            ),
          };
        case "approval":
          return { turns: mapLastAgent(s.turns, (t) => ({ ...t, approvals: env.requests ?? [] })) };
        case "subagent": {
          const id = env.id ?? crypto.randomUUID();
          const patch: Partial<UIToolCall> = {
            status: env.status === "completed" ? "completed" : "started",
          };
          if (env.name) patch.name = env.name;
          if (env.args !== undefined) patch.args = env.args;
          if (env.output !== undefined) patch.output = env.output;
          return { turns: mapLastAgent(s.turns, (t) => upsertSubagent(t, id, patch)) };
        }
        case "error":
          return {
            turns: mapLastAgent(s.turns, (t) => ({
              ...t,
              status: "failed",
              error: String(env.output ?? "error"),
            })),
          };
        default:
          return {};
      }
    }),

  finishTurn: (status, finalText, error) =>
    set((s) => ({
      isStreaming: false,
      activeTaskId: null,
      turns: mapLastAgent(s.turns, (t) => ({
        ...t,
        status,
        text: finalText && finalText.trim() ? finalText : t.text,
        error: error ?? t.error,
      })),
    })),

  // Agent paused for a human decision: keep the task id so we can resume it.
  pauseForApproval: () =>
    set((s) => ({
      isStreaming: false,
      pendingTaskId: s.activeTaskId,
      activeTaskId: null,
      turns: mapLastAgent(s.turns, (t) => ({ ...t, status: "input-required" })),
    })),

  // User decided: reopen the same turn for the continuation stream.
  resumeForDecision: () =>
    set((s) => ({
      isStreaming: true,
      activeTaskId: s.pendingTaskId,
      pendingTaskId: null,
      turns: mapLastAgent(s.turns, (t) => ({ ...t, status: "streaming", approvals: undefined })),
    })),
}));
