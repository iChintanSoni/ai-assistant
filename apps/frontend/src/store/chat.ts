/** Conversation state: turns (with streamed reasoning/text/tools/approvals), model, ids. */
import { create } from "zustand";
import type { ModelInfo } from "../lib/models";
import type { ApprovalRequest, Envelope } from "../lib/envelope";

export type TurnStatus = "streaming" | "complete" | "canceled" | "failed" | "input-required";

/** Token usage for a turn (or a completed subagent delegation within it). */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** A one-shot record of the summarization middleware compacting older history mid-turn. */
export interface UICompaction {
  id: string;
  summary: string;
}

export interface UIToolCall {
  id: string;
  name: string;
  args?: unknown;
  output?: unknown;
  status: "started" | "completed" | "error";
  /** Only ever set on subagent entries — the subagent's own token usage, tracked separately from the main turn total. */
  usage?: TurnUsage;
}

/** A file-storage URL, persisted as-is in history so it stays navigable across reloads. */
export interface UIAttachment {
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

/** Pre-fix persisted shape: only images had a URL (as `previewUrl`); other kinds are unrecoverable. */
export interface LegacyUIAttachment {
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
  /** Legacy persisted conversations stored these as plain filename strings or the pre-fix shape above. */
  attachments?: (UIAttachment | LegacyUIAttachment | string)[];
  /** Document library ids active when this (user) turn was sent — used to trace a document back to the chats that used it. */
  documentIds?: string[];
  approvals?: ApprovalRequest[];
  subagents?: UIToolCall[];
  compactions?: UICompaction[];
  /** Cumulative conversation total as of this turn (not a sum across turns — Ollama
   * resends the whole growing history each call, so the latest snapshot IS the total). */
  usage?: TurnUsage;
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
  beginTurn: (userText: string, attachments: UIAttachment[], documentIds: string[]) => void;
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
  else next.push({ id, name: patch.name ?? "subagent", args: patch.args, output: patch.output, usage: patch.usage, status: patch.status ?? "started" });
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

  beginTurn: (userText, attachments, documentIds) =>
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
          documentIds: documentIds.length > 0 ? documentIds : undefined,
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
          if (env.usage) patch.usage = env.usage;
          return { turns: mapLastAgent(s.turns, (t) => upsertSubagent(t, id, patch)) };
        }
        case "usage":
          return env.usage
            ? { turns: mapLastAgent(s.turns, (t) => ({ ...t, usage: env.usage })) }
            : {};
        case "compaction":
          return typeof env.output === "string" && env.output
            ? {
                turns: mapLastAgent(s.turns, (t) => ({
                  ...t,
                  compactions: [...(t.compactions ?? []), { id: env.id ?? crypto.randomUUID(), summary: env.output as string }],
                })),
              }
            : {};
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
