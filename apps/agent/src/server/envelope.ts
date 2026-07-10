/**
 * The streaming envelope — our app-level protocol layered on A2A.
 *
 * A2A has no native "thinking" / "tool-call" event, so each incremental
 * TaskStatusUpdateEvent carries ONE DataPart whose `data` is an Envelope.
 * The frontend decodes these into thinking blocks, answer text, and a tool
 * timeline. Finished, addressable outputs use TaskArtifactUpdateEvent instead.
 */
export type EnvelopeType =
  | "reasoning"
  | "text"
  | "tool_call"
  | "tool_result"
  | "subagent"
  | "approval"
  | "usage"
  | "compaction"
  | "error";

export type EnvelopeStatus = "started" | "delta" | "completed" | "error";

/** A single tool call awaiting human approval (HITL). */
export interface ApprovalRequest {
  name: string;
  args?: Record<string, unknown>;
  description?: string;
  allowedDecisions?: string[];
}

/** Token usage for one chat-model call (or the running total for the turn). */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface Envelope {
  /** Envelope schema version. */
  v: 1;
  type: EnvelopeType;
  /** Correlates deltas that belong to the same block (model run id / tool call id). */
  id?: string;
  /** Incremental text for `reasoning` / `text`. */
  delta?: string;
  /** Tool or subagent name. */
  name?: string;
  /** Tool-call input. */
  args?: unknown;
  /** Tool-call output / result. */
  output?: unknown;
  /** Pending approvals, for `type: "approval"`. */
  requests?: ApprovalRequest[];
  /** Token usage, for `type: "usage"` (turn total) or a completed `subagent` (its own usage). */
  usage?: TurnUsage;
  status?: EnvelopeStatus;
}

export function isEnvelope(data: unknown): data is Envelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { v?: unknown }).v === 1 &&
    typeof (data as { type?: unknown }).type === "string"
  );
}
