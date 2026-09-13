import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/a2a", () => ({ getClient: vi.fn() }));
vi.mock("../lib/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("../lib/history", () => ({ saveConversation: vi.fn() }));

import { Role, TaskState, type Message, type Part, type StreamResponse, type Task, type TaskStatus } from "@a2a-js/sdk";
import { getClient } from "../lib/a2a";
import { uploadFile } from "../lib/upload";
import { saveConversation } from "../lib/history";
import { useChatStore } from "../store/chat";
import { useChat } from "./useChat";
import type { ModelInfo } from "../lib/models";

function asyncEvents<T>(events: T[]) {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

function fakeClient(events: StreamResponse[] = []) {
  return {
    sendMessageStream: vi.fn((_args: { message: Message }) => asyncEvents(events)),
    cancelTask: vi.fn().mockResolvedValue(undefined),
  };
}

function textPart(text: string): Part {
  return { content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" };
}

function dataPart(data: unknown): Part {
  return { content: { $case: "data", value: data }, metadata: undefined, filename: "", mediaType: "application/json" };
}

function agentMessage(parts: Part[]): Message {
  return {
    messageId: "a1",
    contextId: "",
    taskId: "",
    role: Role.ROLE_AGENT,
    parts,
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

function taskEvent(id: string, contextId: string): StreamResponse {
  const task: Task = { id, contextId, status: undefined, artifacts: [], history: [], metadata: undefined };
  return { payload: { $case: "task", value: task } };
}

function statusEvent(status: TaskStatus): StreamResponse {
  return {
    payload: {
      $case: "statusUpdate",
      value: { taskId: "t1", contextId: "c1", status, metadata: undefined },
    },
  };
}

function messageEvent(parts: Part[]): StreamResponse {
  return { payload: { $case: "message", value: agentMessage(parts) } };
}

function model(): ModelInfo {
  return { name: "m1", modalities: ["text", "image"], tools: true, thinking: false, contextLength: null };
}

beforeEach(() => {
  useChatStore.setState({
    models: [model()],
    selectedModel: "m1",
    modelsError: null,
    contextId: null,
    activeTaskId: null,
    pendingTaskId: null,
    isStreaming: false,
    turns: [],
    activeDocumentIds: [],
  });
  vi.mocked(uploadFile).mockReset();
  vi.mocked(saveConversation).mockReset().mockResolvedValue(undefined);
  vi.mocked(getClient).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("send() does nothing without a selected model", async () => {
  useChatStore.setState({ selectedModel: null });
  const { result } = renderHook(() => useChat());
  await act(async () => result.current.send("hi", []));
  expect(getClient).not.toHaveBeenCalled();
});

test("send() does nothing while already streaming", async () => {
  useChatStore.setState({ isStreaming: true });
  const { result } = renderHook(() => useChat());
  await act(async () => result.current.send("hi", []));
  expect(getClient).not.toHaveBeenCalled();
});

test("send() does nothing for blank text with no files", async () => {
  const { result } = renderHook(() => useChat());
  await act(async () => result.current.send("   ", []));
  expect(getClient).not.toHaveBeenCalled();
});

test("send() begins the turn and streams a text message to the agent", async () => {
  const client = fakeClient([messageEvent([textPart("hi back")])]);
  vi.mocked(getClient).mockResolvedValue(client as never);

  const { result } = renderHook(() => useChat());
  await act(async () => result.current.send("hello", []));

  expect(useChatStore.getState().turns[0]).toMatchObject({ role: "user", text: "hello" });
  const [args] = client.sendMessageStream.mock.calls[0]!;
  expect(args.message).toMatchObject({
    role: Role.ROLE_USER,
    parts: [textPart("hello")],
    metadata: { model: "m1" },
  });
  await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
  expect(useChatStore.getState().turns.at(-1)!.text).toBe("hi back");
});

test("send() uploads attached files first and references them by url in the message", async () => {
  vi.mocked(uploadFile).mockResolvedValue({ url: "http://files/a.png", filename: "a.png", size: 1, mimetype: "image/png" });
  const client = fakeClient([]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());
  const file = new File(["x"], "a.png", { type: "image/png" });

  await act(async () => result.current.send("", [file]));

  expect(uploadFile).toHaveBeenCalledWith(file);
  const [args] = client.sendMessageStream.mock.calls[0]!;
  expect(args.message.parts).toEqual([
    { content: { $case: "url", value: "http://files/a.png" }, metadata: undefined, filename: "a.png", mediaType: "image/png" },
  ]);
  expect(useChatStore.getState().turns[0]!.attachments).toEqual([{ name: "a.png", url: "http://files/a.png", mimeType: "image/png", size: 1 }]);
});

test("send() includes activeDocumentIds in metadata when documents are active", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  const client = fakeClient([]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  const [args] = client.sendMessageStream.mock.calls[0]!;
  expect(args.message.metadata).toMatchObject({ documentIds: ["doc-1"] });
});

test("a task event records the active task/context ids", async () => {
  const client = fakeClient([taskEvent("t1", "c1")]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  expect(useChatStore.getState().activeTaskId).toBe("t1");
  expect(useChatStore.getState().contextId).toBe("c1");
});

test("a status-update applies envelope data parts and finishes on 'completed'", async () => {
  const client = fakeClient([
    statusEvent({
      state: TaskState.TASK_STATE_COMPLETED,
      message: agentMessage([dataPart({ v: 1, type: "text", delta: "" }), textPart("final")]),
      timestamp: "t",
    }),
  ]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  const agent = useChatStore.getState().turns.at(-1)!;
  expect(agent.status).toBe("complete");
  expect(agent.text).toBe("final");
});

test("a status-update in 'input-required' pauses for approval", async () => {
  const client = fakeClient([
    statusEvent({ state: TaskState.TASK_STATE_INPUT_REQUIRED, message: agentMessage([]), timestamp: "t" }),
  ]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  const s = useChatStore.getState();
  expect(s.turns.at(-1)!.status).toBe("input-required");
  expect(s.isStreaming).toBe(false);
});

test("a status-update in 'failed' records the failure message", async () => {
  const client = fakeClient([
    statusEvent({ state: TaskState.TASK_STATE_FAILED, message: agentMessage([textPart("went wrong")]), timestamp: "t" }),
  ]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  expect(useChatStore.getState().turns.at(-1)!.error).toBe("went wrong");
});

test("a bare 'message' event finishes the turn with its text", async () => {
  const client = fakeClient([messageEvent([textPart("done")])]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  expect(useChatStore.getState().turns.at(-1)!.text).toBe("done");
});

test("a stream failure marks the turn failed with the error message", async () => {
  vi.mocked(getClient).mockResolvedValue({
    sendMessageStream: vi.fn(() => {
      throw new Error("stream broke");
    }),
    cancelTask: vi.fn(),
  } as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));

  const agent = useChatStore.getState().turns.at(-1)!;
  expect(agent.status).toBe("failed");
  expect(agent.error).toBe("stream broke");
});

test("persists the conversation after a stream completes, and swallows a save error", async () => {
  // persistConversation() only saves once a contextId is known, so seed one
  // (normally set by a 'task' event, omitted here since this test only cares about persistence).
  useChatStore.setState({ contextId: "c1" });
  vi.mocked(saveConversation).mockRejectedValue(new Error("save failed"));
  const client = fakeClient([messageEvent([textPart("ok")])]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.send("hi", []));
  await waitFor(() => expect(saveConversation).toHaveBeenCalledWith("c1", "m1", expect.any(Array)));
});

test("respond() resumes with the pending task id and streams a decision message", async () => {
  useChatStore.setState({ pendingTaskId: "pending-1", contextId: "c1" });
  const client = fakeClient([]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.respond([{ type: "approve" }]));

  const [args] = client.sendMessageStream.mock.calls[0]!;
  expect(args.message).toMatchObject({
    taskId: "pending-1",
    parts: [dataPart({ type: "decision", decisions: [{ type: "approve" }] })],
  });
});

test("respond() does nothing without a pending task", async () => {
  const client = fakeClient([]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.respond([{ type: "approve" }]));

  expect(client.sendMessageStream).not.toHaveBeenCalled();
});

test("stop() cancels the active task", async () => {
  useChatStore.setState({ activeTaskId: "t1" });
  const client = fakeClient([]);
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.stop());

  expect(client.cancelTask).toHaveBeenCalledWith({ tenant: "", id: "t1", metadata: undefined });
});

test("stop() is a no-op without an active task, and swallows a cancel error otherwise", async () => {
  const client = fakeClient([]);
  vi.mocked(client.cancelTask).mockRejectedValue(new Error("already gone"));
  vi.mocked(getClient).mockResolvedValue(client as never);
  const { result } = renderHook(() => useChat());

  await act(async () => result.current.stop());
  expect(client.cancelTask).not.toHaveBeenCalled();

  useChatStore.setState({ activeTaskId: "t1" });
  await act(async () => result.current.stop()); // should not throw despite rejection
});
