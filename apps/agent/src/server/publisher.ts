/** Builds and publishes A2A events onto an ExecutionEventBus for one task run. */
import { randomUUID } from "node:crypto";
import type { ExecutionEventBus } from "@a2a-js/sdk/server";
import type {
  DataPart,
  Message,
  Task,
  TaskState,
  TaskStatusUpdateEvent,
  TextPart,
} from "@a2a-js/sdk";
import type { Envelope } from "./envelope.js";

export class A2APublisher {
  private settled = false;

  constructor(
    private readonly bus: ExecutionEventBus,
    readonly taskId: string,
    readonly contextId: string,
  ) {}

  get isSettled(): boolean {
    return this.settled;
  }

  /** First event: establish the Task (with the user's message in history). */
  startTask(userMessage: Message): void {
    const task: Task = {
      kind: "task",
      id: this.taskId,
      contextId: this.contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [userMessage],
    };
    this.bus.publish(task);
  }

  private agentMessage(parts: (DataPart | TextPart)[]): Message {
    return {
      kind: "message",
      role: "agent",
      messageId: randomUUID(),
      taskId: this.taskId,
      contextId: this.contextId,
      parts,
    };
  }

  private status(
    state: TaskState,
    message: Message | undefined,
    final: boolean,
  ): TaskStatusUpdateEvent {
    return {
      kind: "status-update",
      taskId: this.taskId,
      contextId: this.contextId,
      status: { state, message, timestamp: new Date().toISOString() },
      final,
    };
  }

  /** Non-final streaming envelope (task stays `working`). */
  emit(envelope: Envelope): void {
    if (this.settled) return;
    const part: DataPart = { kind: "data", data: envelope as unknown as Record<string, unknown> };
    this.bus.publish(this.status("working", this.agentMessage([part]), false));
  }

  /** Terminal `completed` carrying the final assistant text. Idempotent. */
  complete(finalText: string): void {
    if (this.settled) return;
    this.settled = true;
    const part: TextPart = { kind: "text", text: finalText };
    this.bus.publish(this.status("completed", this.agentMessage([part]), true));
    this.bus.finished();
  }

  /** Terminal `input-required` carrying an approval-request envelope (HITL). */
  inputRequired(envelope: Envelope): void {
    if (this.settled) return;
    this.settled = true;
    const part: DataPart = { kind: "data", data: envelope as unknown as Record<string, unknown> };
    this.bus.publish(this.status("input-required", this.agentMessage([part]), true));
    this.bus.finished();
  }

  /** Terminal `canceled`. Idempotent. */
  canceled(): void {
    if (this.settled) return;
    this.settled = true;
    this.bus.publish(this.status("canceled", undefined, true));
    this.bus.finished();
  }

  /** Terminal `failed` with a human-readable message. Idempotent. */
  failed(message: string): void {
    if (this.settled) return;
    this.settled = true;
    const part: TextPart = { kind: "text", text: message };
    this.bus.publish(this.status("failed", this.agentMessage([part]), true));
    this.bus.finished();
  }
}
