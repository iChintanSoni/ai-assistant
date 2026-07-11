import { expect, test, vi } from "vitest";
import { runAgentToEvents } from "../src/server/streaming.js";
import type { A2APublisher } from "../src/server/publisher.js";

interface FakeEvent {
  event: string;
  name?: string;
  run_id?: string;
  data?: { chunk?: unknown; input?: unknown; output?: unknown };
}

interface StateResult {
  next: string[];
  tasks: Array<{ interrupts?: Array<{ id?: string; value?: unknown }> }>;
  values?: { _summarizationEvent?: { cutoffIndex: number; summaryMessage?: { content?: unknown } } };
}

function fakeAgent(events: FakeEvent[], stateResults: StateResult[]) {
  const getState = vi.fn();
  for (const r of stateResults) getState.mockResolvedValueOnce(r);
  return {
    streamEvents: () =>
      (async function* () {
        for (const e of events) yield e;
      })(),
    getState,
  };
}

function emptyState(cutoffIndex?: number): StateResult {
  return { next: [], tasks: [], values: cutoffIndex !== undefined ? { _summarizationEvent: { cutoffIndex } } : undefined };
}

function fakePublisher() {
  return { emit: vi.fn() } as unknown as A2APublisher;
}

function run(events: FakeEvent[], stateResults: StateResult[], signal = new AbortController().signal) {
  const publisher = fakePublisher();
  const agent = fakeAgent(events, stateResults);
  const promise = runAgentToEvents({ agent: agent as never, input: {}, threadId: "thread-1", signal, publisher });
  return { promise, publisher, agent };
}

test("streams text and reasoning deltas, and returns the final assistant text from on_chat_model_end", async () => {
  const { promise, publisher } = run(
    [
      { event: "on_chat_model_stream", run_id: "r1", data: { chunk: { content: "Hello " } } },
      { event: "on_chat_model_stream", run_id: "r1", data: { chunk: { content: [{ type: "thinking", thinking: "pondering" }] } } },
      { event: "on_chat_model_stream", run_id: "r1", data: { chunk: { content: "world" } } },
      { event: "on_chat_model_end", data: { output: { content: "Hello world" } } },
    ],
    [emptyState(), emptyState()],
  );

  const result = await promise;

  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "text", id: "r1", delta: "Hello ", status: "delta" });
  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "reasoning", id: "r1", delta: "pondering", status: "delta" });
  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "text", id: "r1", delta: "world", status: "delta" });
  expect(result.finalText).toBe("Hello world");
  expect(result.interrupt).toBeNull();
  expect(result.compaction).toBeNull();
});

test("reads reasoning_content from additional_kwargs when content has no thinking block", async () => {
  const { promise, publisher } = run(
    [{ event: "on_chat_model_stream", run_id: "r1", data: { chunk: { content: "", additional_kwargs: { reasoning_content: "deep thought" } } } }],
    [emptyState(), emptyState()],
  );
  await promise;
  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "reasoning", id: "r1", delta: "deep thought", status: "delta" });
});

test("extracts final text from an array-of-blocks chat-model-end output", async () => {
  const { promise } = run(
    [{ event: "on_chat_model_end", data: { output: { content: [{ type: "text", text: "block one " }, { type: "text", text: "block two" }] } } }],
    [emptyState(), emptyState()],
  );
  const result = await promise;
  expect(result.finalText).toBe("block one block two");
});

test("emits tool_call/tool_result for an ordinary (non-delegation) tool", async () => {
  const { promise, publisher } = run(
    [
      { event: "on_tool_start", run_id: "t1", name: "web_search", data: { input: { query: "cats" } } },
      { event: "on_tool_end", run_id: "t1", name: "web_search", data: { output: "search results" } },
    ],
    [emptyState(), emptyState()],
  );
  await promise;
  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "tool_call", id: "t1", name: "web_search", args: { query: "cats" }, status: "started" });
  expect(publisher.emit).toHaveBeenCalledWith({ v: 1, type: "tool_result", id: "t1", name: "web_search", output: "search results", status: "completed" });
});

test("normalizeToolOutput extracts .content from a wrapped tool output, and defaults to null when output is absent", async () => {
  const { promise, publisher } = run(
    [
      { event: "on_tool_start", run_id: "t1", name: "x", data: {} },
      { event: "on_tool_end", run_id: "t1", name: "x", data: { output: { content: "unwrapped" } } },
      { event: "on_tool_start", run_id: "t2", name: "y", data: {} },
      { event: "on_tool_end", run_id: "t2", name: "y", data: {} },
    ],
    [emptyState(), emptyState()],
  );
  await promise;
  expect(publisher.emit).toHaveBeenCalledWith(expect.objectContaining({ id: "t1", output: "unwrapped" }));
  expect(publisher.emit).toHaveBeenCalledWith(expect.objectContaining({ id: "t2", output: null }));
});

test("a delegation tool (task) emits subagent envelopes and suppresses nested model/tool events from the main turn", async () => {
  const { promise, publisher } = run(
    [
      { event: "on_tool_start", run_id: "d1", name: "task", data: { input: { input: JSON.stringify({ subagent_type: "researcher", description: "look this up" }) } } },
      // nested activity: must not surface as top-level text/tool events
      { event: "on_chat_model_stream", run_id: "nested", data: { chunk: { content: "nested thinking" } } },
      { event: "on_tool_start", run_id: "nested-tool", name: "web_search", data: { input: {} } },
      { event: "on_tool_end", run_id: "nested-tool", name: "web_search", data: { output: "nested result" } },
      { event: "on_tool_end", run_id: "d1", name: "task", data: { output: "delegation done" } },
    ],
    [emptyState(), emptyState()],
  );
  await promise;

  expect(publisher.emit).toHaveBeenCalledWith(
    expect.objectContaining({ type: "subagent", id: "d1", name: "researcher", status: "started" }),
  );
  expect(publisher.emit).toHaveBeenCalledWith(
    expect.objectContaining({ type: "subagent", id: "d1", output: "delegation done", status: "completed" }),
  );
  expect(publisher.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "text" }));
  expect(publisher.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "tool_call" }));
  expect(publisher.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "tool_result" }));
});

test("folds a delegation's nested usage onto its completed subagent envelope", async () => {
  const { promise, publisher } = run(
    [
      { event: "on_tool_start", run_id: "d1", name: "task", data: { input: { subagent_type: "researcher" } } },
      { event: "on_chat_model_end", data: { output: { content: "", usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } } },
      { event: "on_tool_end", run_id: "d1", name: "task", data: { output: "done" } },
    ],
    [emptyState(), emptyState()],
  );
  await promise;
  expect(publisher.emit).toHaveBeenCalledWith(
    expect.objectContaining({ type: "subagent", id: "d1", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
  );
});

test("foldUsage adds incremental usage samples across consecutive chat-model calls", async () => {
  const { promise } = run(
    [
      { event: "on_chat_model_end", data: { output: { content: "", usage_metadata: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } } } },
      { event: "on_chat_model_end", data: { output: { content: "", usage_metadata: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } } },
    ],
    [emptyState(), emptyState()],
  );
  const result = await promise;
  // second sample's inputTokens (20) < running total (110) => incremental cache-hit => add
  expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 15, totalTokens: 135 });
});

test("foldUsage replaces (rather than adds) when a later sample's inputTokens meets or exceeds the running total", async () => {
  const { promise } = run(
    [
      { event: "on_chat_model_end", data: { output: { content: "", usage_metadata: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } } },
      { event: "on_chat_model_end", data: { output: { content: "", usage_metadata: { input_tokens: 500, output_tokens: 20, total_tokens: 520 } } } },
    ],
    [emptyState(), emptyState()],
  );
  const result = await promise;
  // second sample's inputTokens (500) >= running total (12) => full resend => replace, not add
  expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 20, totalTokens: 520 });
});

test("returns null usage when no chat-model call reports usage_metadata", async () => {
  const { promise } = run([{ event: "on_chat_model_end", data: { output: { content: "no usage here" } } }], [emptyState(), emptyState()]);
  const result = await promise;
  expect(result.usage).toBeNull();
});

test("surfaces a pending HITL interrupt found in state after the stream ends", async () => {
  const interruptValue = { actionRequests: [{ name: "send_email", args: { to: "a@b.com" } }], reviewConfigs: [{ actionName: "send_email", allowedDecisions: ["approve", "reject"] }] };
  const { promise } = run([], [emptyState(), { next: ["tools"], tasks: [{ interrupts: [{ id: "i1", value: interruptValue }] }] }]);
  const result = await promise;
  expect(result.interrupt).toEqual(interruptValue);
});

test("reports a compaction summary only when the cutoffIndex changed during this turn", async () => {
  const { promise } = run(
    [],
    [emptyState(3), { next: [], tasks: [], values: { _summarizationEvent: { cutoffIndex: 7, summaryMessage: { content: "older history summarized" } } } }],
  );
  const result = await promise;
  expect(result.compaction).toEqual({ summary: "older history summarized" });
});

test("reports no compaction when the cutoffIndex is unchanged from before the turn", async () => {
  const { promise } = run(
    [],
    [emptyState(3), { next: [], tasks: [], values: { _summarizationEvent: { cutoffIndex: 3, summaryMessage: { content: "should be ignored" } } } }],
  );
  const result = await promise;
  expect(result.compaction).toBeNull();
});

test("reports no compaction when the new summary text is blank", async () => {
  const { promise } = run(
    [],
    [emptyState(3), { next: [], tasks: [], values: { _summarizationEvent: { cutoffIndex: 9, summaryMessage: { content: "   " } } } }],
  );
  const result = await promise;
  expect(result.compaction).toBeNull();
});

test("stops consuming events and returns without a second getState call once the signal is aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const { promise, publisher, agent } = run(
    [{ event: "on_chat_model_stream", run_id: "r1", data: { chunk: { content: "should not appear" } } }],
    [emptyState()],
    controller.signal,
  );
  const result = await promise;

  expect(publisher.emit).not.toHaveBeenCalled();
  expect(result.finalText).toBe("");
  expect(result.interrupt).toBeNull();
  expect(result.compaction).toBeNull();
  expect(agent.getState).toHaveBeenCalledTimes(1); // only the "before" snapshot, not the post-loop one
});

test("treats a getState failure before the run as 'no prior compaction' without throwing", async () => {
  const publisher = fakePublisher();
  const getState = vi.fn().mockRejectedValueOnce(new Error("db locked")).mockResolvedValueOnce(emptyState());
  const agent = { streamEvents: () => (async function* () {})(), getState };

  const result = await runAgentToEvents({ agent: agent as never, input: {}, threadId: "t1", signal: new AbortController().signal, publisher });

  expect(result.finalText).toBe("");
  expect(result.compaction).toBeNull();
});

test("treats a getState failure after the run as 'no interrupt/compaction' without throwing", async () => {
  const publisher = fakePublisher();
  const getState = vi.fn().mockResolvedValueOnce(emptyState()).mockRejectedValueOnce(new Error("db locked"));
  const agent = { streamEvents: () => (async function* () {})(), getState };

  const result = await runAgentToEvents({ agent: agent as never, input: {}, threadId: "t1", signal: new AbortController().signal, publisher });

  expect(result.interrupt).toBeNull();
  expect(result.compaction).toBeNull();
});
