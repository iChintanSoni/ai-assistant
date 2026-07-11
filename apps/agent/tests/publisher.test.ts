import { beforeEach, expect, test, vi } from "vitest";
import type { ExecutionEventBus } from "@a2a-js/sdk/server";
import type { Message, Task, TaskStatusUpdateEvent } from "@a2a-js/sdk";
import { A2APublisher } from "../src/server/publisher.js";

function fakeBus(): ExecutionEventBus & { publish: ReturnType<typeof vi.fn>; finished: ReturnType<typeof vi.fn> } {
  return { publish: vi.fn(), finished: vi.fn() } as never;
}

const userMessage: Message = { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "text", text: "hi" }] };

let bus: ReturnType<typeof fakeBus>;
let publisher: A2APublisher;

beforeEach(() => {
  bus = fakeBus();
  publisher = new A2APublisher(bus, "task-1", "ctx-1");
});

test("startTask publishes a submitted Task carrying the user's message in history", () => {
  publisher.startTask(userMessage);

  expect(bus.publish).toHaveBeenCalledTimes(1);
  const task = bus.publish.mock.calls[0]![0] as Task;
  expect(task).toMatchObject({ kind: "task", id: "task-1", contextId: "ctx-1", history: [userMessage] });
  expect(task.status.state).toBe("submitted");
});

test("emit publishes a non-final working status-update wrapping the envelope as a data part", () => {
  publisher.emit({ v: 1, type: "text", delta: "hi" });

  const event = bus.publish.mock.calls[0]![0] as TaskStatusUpdateEvent;
  expect(event.kind).toBe("status-update");
  expect(event.status.state).toBe("working");
  expect(event.final).toBe(false);
  expect(event.status.message?.parts[0]).toEqual({ kind: "data", data: { v: 1, type: "text", delta: "hi" } });
});

test("emit is a no-op once the publisher has settled", () => {
  publisher.complete("done");
  bus.publish.mockClear();

  publisher.emit({ v: 1, type: "text", delta: "too late" });

  expect(bus.publish).not.toHaveBeenCalled();
});

test("complete publishes a final completed status with the text, and calls finished()", () => {
  publisher.complete("final answer");

  const event = bus.publish.mock.calls[0]![0] as TaskStatusUpdateEvent;
  expect(event.status.state).toBe("completed");
  expect(event.final).toBe(true);
  expect(event.status.message?.parts[0]).toEqual({ kind: "text", text: "final answer" });
  expect(bus.finished).toHaveBeenCalledTimes(1);
  expect(publisher.isSettled).toBe(true);
});

test("complete is idempotent", () => {
  publisher.complete("first");
  publisher.complete("second");

  expect(bus.publish).toHaveBeenCalledTimes(1);
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("inputRequired publishes a final input-required status carrying the approval envelope", () => {
  publisher.inputRequired({ v: 1, type: "approval", requests: [] });

  const event = bus.publish.mock.calls[0]![0] as TaskStatusUpdateEvent;
  expect(event.status.state).toBe("input-required");
  expect(event.final).toBe(true);
  expect(event.status.message?.parts[0]).toEqual({ kind: "data", data: { v: 1, type: "approval", requests: [] } });
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("canceled publishes a final canceled status with no message", () => {
  publisher.canceled();

  const event = bus.publish.mock.calls[0]![0] as TaskStatusUpdateEvent;
  expect(event.status.state).toBe("canceled");
  expect(event.final).toBe(true);
  expect(event.status.message).toBeUndefined();
  expect(bus.finished).toHaveBeenCalledTimes(1);
});

test("failed publishes a final failed status with the error message as text", () => {
  publisher.failed("boom");

  const event = bus.publish.mock.calls[0]![0] as TaskStatusUpdateEvent;
  expect(event.status.state).toBe("failed");
  expect(event.final).toBe(true);
  expect(event.status.message?.parts[0]).toEqual({ kind: "text", text: "boom" });
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
