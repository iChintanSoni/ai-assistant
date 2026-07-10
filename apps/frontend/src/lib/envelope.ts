/** Mirror of the server's streaming envelope (carried in A2A DataParts). */
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

/** A human decision on a pending action, sent back to resume the agent. */
export type Decision = { type: "approve" } | { type: "reject"; message?: string };

export interface Envelope {
  v: 1;
  type: EnvelopeType;
  id?: string;
  delta?: string;
  name?: string;
  args?: unknown;
  output?: unknown;
  requests?: ApprovalRequest[];
  usage?: TurnUsage;
  status?: "started" | "delta" | "completed" | "error";
}

export function isEnvelope(data: unknown): data is Envelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { v?: unknown }).v === 1 &&
    typeof (data as { type?: unknown }).type === "string"
  );
}
