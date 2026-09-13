import { beforeEach, expect, test, vi } from "vitest";
import type { ExecutionEventBus } from "@a2a-js/sdk/server";
import { Role, TaskState, type Message, type Task, type TaskStatusUpdateEvent } from "@a2a-js/sdk";
import { A2APublisher } from "../src/server/publisher.js";

function fakeBus(): ExecutionEventBus & { publish: ReturnType<typeof vi.fn>; finished: ReturnType<typeof vi.fn> } {
  return { publish: vi.fn(), finished: vi.fn() } as never;
}

const userMessage: Message = {
  messageId: "m1",
  contextId: "",
  taskId: "",
  role: Role.ROLE_USER,
  parts: [{ content: { $case: "text", value: "hi" }, metadata: undefined, filename: "", mediaType: "text/plain" }],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
};

let bus: ReturnType<typeof fakeBus>;
let publisher: A2APublisher;

beforeEach(() => {
  bus = fakeBus();
  publisher = new A2APublisher(bus, "task-1", "ctx-1");
});

test("startTask publishes a submitted Task carrying the user's message in history", () => {
  publisher.startTask(userMessage);

  expect(bus.publish).toHaveBeenCalledTimes(1);
  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: Task };
  expect(event.kind).toBe("task");
  expect(event.data).toMatchObject({ id: "task-1", contextId: "ctx-1", history: [userMessage] });
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_SUBMITTED);
});

test("resumeTask republishes the given Task as-is (the first event a resumed stream requires)", () => {
  const existing: Task = {
    id: "task-1",
    contextId: "ctx-1",
    status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: "t" },
    artifacts: [],
    history: [userMessage],
    metadata: undefined,
  };

  publisher.resumeTask(existing);

  expect(bus.publish).toHaveBeenCalledTimes(1);
  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: Task };
  expect(event.kind).toBe("task");
  expect(event.data).toBe(existing);
});

test("emit publishes a working status-update wrapping the envelope as a data part", () => {
  publisher.emit({ v: 1, type: "text", delta: "hi" });

  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: TaskStatusUpdateEvent };
  expect(event.kind).toBe("statusUpdate");
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_WORKING);
  expect(event.data.status?.message?.parts[0]).toEqual({
    content: { $case: "data", value: { v: 1, type: "text", delta: "hi" } },
    metadata: undefined,
    filename: "",
    mediaType: "application/json",
  });
});

test("emit is a no-op once the publisher has settled", () => {
  publisher.complete("done");
  bus.publish.mockClear();

  publisher.emit({ v: 1, type: "text", delta: "too late" });

  expect(bus.publish).not.toHaveBeenCalled();
});

test("complete publishes a completed status with the text, and calls finished()", () => {
  publisher.complete("final answer");

  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: TaskStatusUpdateEvent };
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
  expect(event.data.status?.message?.parts[0]).toEqual({
    content: { $case: "text", value: "final answer" },
    metadata: undefined,
    filename: "",
    mediaType: "text/plain",
  });
  expect(bus.finished).toHaveBeenCalledTimes(1);
  expect(publisher.isSettled).toBe(true);
});

test("complete is idempotent", () => {
  publisher.complete("first");
  publisher.complete("second");

  expect(bus.publish).toHaveBeenCalledTimes(1);
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("inputRequired publishes an input-required status carrying the approval envelope", () => {
  publisher.inputRequired({ v: 1, type: "approval", requests: [] });

  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: TaskStatusUpdateEvent };
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
  expect(event.data.status?.message?.parts[0]).toEqual({
    content: { $case: "data", value: { v: 1, type: "approval", requests: [] } },
    metadata: undefined,
    filename: "",
    mediaType: "application/json",
  });
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("canceled publishes a canceled status with no message", () => {
  publisher.canceled();

  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: TaskStatusUpdateEvent };
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_CANCELED);
  expect(event.data.status?.message).toBeUndefined();
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("failed publishes a failed status with the error message as text", () => {
  publisher.failed("boom");

  const event = bus.publish.mock.calls[0]![0] as { kind: string; data: TaskStatusUpdateEvent };
  expect(event.data.status?.state).toBe(TaskState.TASK_STATE_FAILED);
  expect(event.data.status?.message?.parts[0]).toEqual({
    content: { $case: "text", value: "boom" },
    metadata: undefined,
    filename: "",
    mediaType: "text/plain",
  });
});

test("terminal methods are mutually idempotent: whichever settles first wins", () => {
  publisher.complete("done");
  publisher.failed("too late");
  publisher.canceled();
  publisher.inputRequired({ v: 1, type: "approval", requests: [] });

  expect(bus.publish).toHaveBeenCalledTimes(1);
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("isSettled is false until a terminal method runs", () => {
  expect(publisher.isSettled).toBe(false);
  publisher.emit({ v: 1, type: "text", delta: "x" });
  expect(publisher.isSettled).toBe(false);
  publisher.canceled();
  expect(publisher.isSettled).toBe(true);
});
