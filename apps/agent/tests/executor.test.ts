import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/agent/deepAgent.js", () => ({ buildAgent: vi.fn() }));
vi.mock("../src/agent/models.js", () => ({ describeModel: vi.fn(), getDefaultModel: vi.fn(() => "default-model") }));
vi.mock("../src/server/streaming.js", () => ({ runAgentToEvents: vi.fn() }));
vi.mock("../src/agent/documentStore.js", () => ({ getDocumentsByIds: vi.fn(() => []) }));

import type { ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";
import type { Message } from "@a2a-js/sdk";
import { Command } from "@langchain/langgraph";
import { buildAgent } from "../src/agent/deepAgent.js";
import { describeModel } from "../src/agent/models.js";
import { runAgentToEvents } from "../src/server/streaming.js";
import { getDocumentsByIds } from "../src/agent/documentStore.js";
import { A2APublisher } from "../src/server/publisher.js";
import { DeepAgentExecutor } from "../src/server/executor.js";

function fakeBus(): ExecutionEventBus {
  return { publish: vi.fn(), finished: vi.fn() } as never;
}

function textMessage(text: string, overrides: Partial<Message> = {}): Message {
  return { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "text", text }], ...overrides };
}

function ctx(userMessage: Message, taskId = "task-1", contextId = "ctx-1"): RequestContext {
  return { userMessage, taskId, contextId } as never;
}

function eligibleModel(modalities: string[] = ["text"]) {
  return { name: "m", modalities, tools: true, thinking: false, contextLength: null, eligible: true };
}

let startTaskSpy: ReturnType<typeof vi.spyOn>;
let completeSpy: ReturnType<typeof vi.spyOn>;
let failedSpy: ReturnType<typeof vi.spyOn>;
let inputRequiredSpy: ReturnType<typeof vi.spyOn>;
let canceledSpy: ReturnType<typeof vi.spyOn>;
let emitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(buildAgent).mockReset().mockResolvedValue({} as never);
  vi.mocked(describeModel).mockReset();
  vi.mocked(runAgentToEvents).mockReset();
  vi.mocked(getDocumentsByIds).mockReset().mockReturnValue([]);

  startTaskSpy = vi.spyOn(A2APublisher.prototype, "startTask");
  completeSpy = vi.spyOn(A2APublisher.prototype, "complete");
  failedSpy = vi.spyOn(A2APublisher.prototype, "failed");
  inputRequiredSpy = vi.spyOn(A2APublisher.prototype, "inputRequired");
  canceledSpy = vi.spyOn(A2APublisher.prototype, "canceled");
  emitSpy = vi.spyOn(A2APublisher.prototype, "emit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("fails without building an agent when the selected model isn't tool-eligible", async () => {
  vi.mocked(describeModel).mockResolvedValue({ ...eligibleModel(), tools: false, eligible: false });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(failedSpy).toHaveBeenCalledWith(expect.stringMatching(/can't orchestrate/));
  expect(buildAgent).not.toHaveBeenCalled();
  expect(runAgentToEvents).not.toHaveBeenCalled();
});

test("fails when an uploaded part isn't supported by the selected model's modalities", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel(["text"])); // no "image"
  const executor = new DeepAgentExecutor();
  const message = textMessage("", {
    parts: [{ kind: "file", file: { mimeType: "image/png", bytes: "abc" } }],
  });

  await executor.execute(ctx(message), fakeBus());

  expect(failedSpy).toHaveBeenCalledWith(expect.stringMatching(/can't read images/));
  expect(buildAgent).not.toHaveBeenCalled();
});

test("a happy-path fresh turn starts the task and completes with the final text", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "the answer", interrupt: null, usage: null, compaction: null });
  const executor = new DeepAgentExecutor();
  const message = textMessage("hi");

  await executor.execute(ctx(message), fakeBus());

  expect(startTaskSpy).toHaveBeenCalledWith(message);
  expect(completeSpy).toHaveBeenCalledWith("the answer");
});

test("falls back to a placeholder when the final text is empty", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "", interrupt: null, usage: null, compaction: null });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(completeSpy).toHaveBeenCalledWith("(no response)");
});

test("emits a usage envelope before completing when usage is reported", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "ok", interrupt: null, usage, compaction: null });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(emitSpy).toHaveBeenCalledWith({ v: 1, type: "usage", usage });
});

test("emits a compaction envelope when the turn compacted older history", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "ok", interrupt: null, usage: null, compaction: { summary: "compacted" } });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(emitSpy).toHaveBeenCalledWith({ v: 1, type: "compaction", output: "compacted", status: "completed" });
});

test("maps a HITL interrupt to an approval envelope and does not complete the task", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockResolvedValue({
    finalText: "",
    interrupt: {
      actionRequests: [{ name: "send_email", args: { to: "x" }, description: "review" }],
      reviewConfigs: [{ actionName: "send_email", allowedDecisions: ["approve"] }],
    },
    usage: null,
    compaction: null,
  });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(inputRequiredSpy).toHaveBeenCalledWith({
    v: 1,
    type: "approval",
    requests: [{ name: "send_email", args: { to: "x" }, description: "review", allowedDecisions: ["approve"] }],
  });
  expect(completeSpy).not.toHaveBeenCalled();
});

test("defaults an interrupt's allowedDecisions to approve/reject when no reviewConfig matches", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockResolvedValue({
    finalText: "",
    interrupt: { actionRequests: [{ name: "unknown_tool" }], reviewConfigs: [] },
    usage: null,
    compaction: null,
  });
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(inputRequiredSpy).toHaveBeenCalledWith({
    v: 1,
    type: "approval",
    requests: [{ name: "unknown_tool", args: undefined, description: undefined, allowedDecisions: ["approve", "reject"] }],
  });
});

test("a resume turn (decision message) skips model/part validation and passes a Command to runAgentToEvents", async () => {
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "resumed answer", interrupt: null, usage: null, compaction: null });
  const executor = new DeepAgentExecutor();
  const resumeMessage = textMessage("", {
    parts: [{ kind: "data", data: { type: "decision", decisions: [{ type: "approve" }] } }],
  });

  await executor.execute(ctx(resumeMessage), fakeBus());

  expect(describeModel).not.toHaveBeenCalled();
  expect(startTaskSpy).not.toHaveBeenCalled();
  const [runArgs] = vi.mocked(runAgentToEvents).mock.calls[0]!;
  expect((runArgs as { input: unknown }).input).toBeInstanceOf(Command);
  expect(((runArgs as { input: Command }).input).resume).toEqual({ decisions: [{ type: "approve" }] });
  expect(completeSpy).toHaveBeenCalledWith("resumed answer");
});

test("prepends an active-documents note to the turn content when documentIds are present in metadata", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(getDocumentsByIds).mockReturnValue([{ id: "doc-1", originalName: "report.pdf" } as never]);
  vi.mocked(runAgentToEvents).mockResolvedValue({ finalText: "ok", interrupt: null, usage: null, compaction: null });
  const executor = new DeepAgentExecutor();
  const message = textMessage("what does it say?", { metadata: { documentIds: ["doc-1"] } });

  await executor.execute(ctx(message), fakeBus());

  const [runArgs] = vi.mocked(runAgentToEvents).mock.calls[0]!;
  const input = (runArgs as { input: { messages: [{ content: string }] } }).input;
  expect(input.messages[0]!.content).toContain("report.pdf (id: doc-1)");
  expect(input.messages[0]!.content).toContain("what does it say?");
});

test("reports a failure when the agent run throws, without leaking the exception", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  vi.mocked(runAgentToEvents).mockRejectedValue(new Error("graph exploded"));
  const executor = new DeepAgentExecutor();

  await executor.execute(ctx(textMessage("hi")), fakeBus());

  expect(failedSpy).toHaveBeenCalledWith("Agent error: graph exploded");
});

test("cancelTask on an unknown task id publishes a standalone canceled event", async () => {
  const executor = new DeepAgentExecutor();

  await executor.cancelTask("never-started", fakeBus());

  expect(canceledSpy).toHaveBeenCalledTimes(1);
});

test("cancelTask on an in-flight run aborts it and suppresses the run's own terminal event", async () => {
  vi.mocked(describeModel).mockResolvedValue(eligibleModel());
  let resolveRun!: (value: { finalText: string; interrupt: null; usage: null; compaction: null }) => void;
  vi.mocked(runAgentToEvents).mockReturnValue(new Promise((resolve) => (resolveRun = resolve)));
  const executor = new DeepAgentExecutor();
  const bus = fakeBus();

  const executePromise = executor.execute(ctx(textMessage("hi"), "task-cancel"), bus);
  await new Promise((r) => setTimeout(r, 0)); // let execute() reach the in-flight await

  await executor.cancelTask("task-cancel", bus);
  expect(canceledSpy).toHaveBeenCalledTimes(1);

  resolveRun({ finalText: "too late", interrupt: null, usage: null, compaction: null });
  await executePromise;

  expect(completeSpy).not.toHaveBeenCalled();
  expect(failedSpy).not.toHaveBeenCalled();
});
