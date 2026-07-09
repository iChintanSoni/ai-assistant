/**
 * Translate a LangGraph `streamEvents(v2)` run into A2A envelope emissions, and
 * detect a human-in-the-loop interrupt once the run pauses.
 *
 * Maps:
 *   on_chat_model_stream -> `reasoning` / `text` deltas (live UI)
 *   on_chat_model_end    -> capture the last full assistant text (final answer)
 *   on_tool_start        -> `tool_call` (input)
 *   on_tool_end          -> `tool_result` (output)
 * After the stream ends, `getState()` is checked for a pending HITL interrupt.
 */
import type { A2APublisher } from "./publisher.js";
import { getSubagents } from "../agent/subagents.js";

// The built-in delegation tool is "task"; also treat any subagent name as delegation.
const DELEGATION_TOOL_NAMES = new Set<string>(["task", ...getSubagents().map((s) => s.name)]);
function isDelegation(name?: string): boolean {
  return !!name && DELEGATION_TOOL_NAMES.has(name);
}

interface StreamEvent {
  event: string;
  name?: string;
  run_id?: string;
  data?: {
    chunk?: unknown;
    input?: unknown;
    output?: unknown;
  };
}

interface StateSnapshotLike {
  next: string[];
  tasks: Array<{ interrupts?: Array<{ id?: string; value?: unknown }> }>;
}

interface AgentLike {
  streamEvents: (input: unknown, options: Record<string, unknown>) => AsyncIterable<StreamEvent>;
  getState: (config: Record<string, unknown>) => Promise<StateSnapshotLike>;
}

/** The HITL interrupt value (langchain `HITLRequest`). */
export interface HITLRequestValue {
  actionRequests?: Array<{ name: string; args?: Record<string, unknown>; description?: string }>;
  reviewConfigs?: Array<{ actionName: string; allowedDecisions?: string[] }>;
}

export interface RunResult {
  finalText: string;
  interrupt: HITLRequestValue | null;
}

interface RunArgs {
  agent: unknown;
  input: unknown;
  threadId: string;
  signal: AbortSignal;
  publisher: A2APublisher;
}

function extractContent(chunk: unknown): { text: string; reasoning: string } {
  let text = "";
  let reasoning = "";
  if (!chunk || typeof chunk !== "object") return { text, reasoning };

  const content = (chunk as { content?: unknown }).content;
  if (typeof content === "string") {
    text += content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: string; text?: string; thinking?: string; reasoning?: string };
      if (b.type === "text") text += b.text ?? "";
      else if (b.type === "thinking" || b.type === "reasoning") {
        reasoning += b.thinking ?? b.reasoning ?? b.text ?? "";
      }
    }
  }

  const kwargs = (chunk as { additional_kwargs?: { reasoning_content?: unknown } }).additional_kwargs;
  if (typeof kwargs?.reasoning_content === "string") reasoning += kwargs.reasoning_content;

  return { text, reasoning };
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string };
        return block && typeof b === "object" && block.type === "text" ? block.text ?? "" : "";
      })
      .join("");
  }
  return "";
}

function normalizeToolOutput(output: unknown): unknown {
  if (output && typeof output === "object" && "content" in output) {
    return (output as { content: unknown }).content;
  }
  return output ?? null;
}

/** Runs the agent, emits streaming envelopes, returns final text + any interrupt. */
export async function runAgentToEvents({
  agent,
  input,
  threadId,
  signal,
  publisher,
}: RunArgs): Promise<RunResult> {
  const a = agent as AgentLike;
  let streamedText = "";
  let lastFinal = "";
  let subagentDepth = 0; // > 0 while inside a delegated subagent run

  const stream = a.streamEvents(input, {
    version: "v2",
    configurable: { thread_id: threadId },
    signal,
  });

  for await (const ev of stream) {
    if (signal.aborted) break;
    const nested = subagentDepth > 0;

    switch (ev.event) {
      case "on_chat_model_stream": {
        if (nested) break; // subagent internals surface via the subagent block, not the main turn
        const { text, reasoning } = extractContent(ev.data?.chunk);
        const id = ev.run_id ?? "model";
        if (reasoning) publisher.emit({ v: 1, type: "reasoning", id, delta: reasoning, status: "delta" });
        if (text) {
          streamedText += text;
          publisher.emit({ v: 1, type: "text", id, delta: text, status: "delta" });
        }
        break;
      }
      case "on_chat_model_end": {
        if (nested) break;
        const finalText = toText((ev.data?.output as { content?: unknown })?.content);
        if (finalText.trim()) lastFinal = finalText;
        break;
      }
      case "on_tool_start": {
        if (isDelegation(ev.name)) {
          const raw = ev.data?.input;
          // deepagents passes the task args as { input: "<json string>" } (or a plain object).
          const inner = raw && typeof raw === "object" ? ((raw as { input?: unknown }).input ?? raw) : raw;
          let args: Record<string, unknown> = {};
          if (typeof inner === "string") {
            try {
              args = JSON.parse(inner) as Record<string, unknown>;
            } catch {
              /* leave args empty */
            }
          } else if (inner && typeof inner === "object") {
            args = inner as Record<string, unknown>;
          }
          const subName =
            (args.subagent_type as string | undefined) ??
            (args.subagentType as string | undefined) ??
            (args.agentName as string | undefined) ??
            (args.name as string | undefined) ??
            ev.name ??
            "subagent";
          publisher.emit({
            v: 1,
            type: "subagent",
            id: ev.run_id,
            name: subName,
            args: args.description ?? inner ?? raw,
            status: "started",
          });
          subagentDepth += 1;
        } else if (!nested) {
          publisher.emit({
            v: 1,
            type: "tool_call",
            id: ev.run_id,
            name: ev.name,
            args: ev.data?.input,
            status: "started",
          });
        }
        break;
      }
      case "on_tool_end": {
        if (isDelegation(ev.name)) {
          if (subagentDepth > 0) subagentDepth -= 1;
          publisher.emit({
            v: 1,
            type: "subagent",
            id: ev.run_id,
            output: normalizeToolOutput(ev.data?.output),
            status: "completed",
          });
        } else if (!nested) {
          publisher.emit({
            v: 1,
            type: "tool_result",
            id: ev.run_id,
            name: ev.name,
            output: normalizeToolOutput(ev.data?.output),
            status: "completed",
          });
        }
        break;
      }
      default:
        break;
    }
  }

  if (signal.aborted) return { finalText: lastFinal || streamedText, interrupt: null };

  // Did the run pause at a human-in-the-loop interrupt?
  let interrupt: HITLRequestValue | null = null;
  try {
    const snap = await a.getState({ configurable: { thread_id: threadId } });
    const interrupts = (snap.tasks ?? []).flatMap((t) => t.interrupts ?? []);
    const value = interrupts[0]?.value;
    if (value && typeof value === "object") interrupt = value as HITLRequestValue;
  } catch {
    // If state can't be read, treat as no interrupt.
  }

  return { finalText: lastFinal || streamedText, interrupt };
}
