/** Builds and publishes A2A events onto an ExecutionEventBus for one task run. */
import { randomUUID } from "node:crypto";
import { AgentEvent, type ExecutionEventBus } from "@a2a-js/sdk/server";
import { Role, TaskState, type Message, type Part, type Task, type TaskStatusUpdateEvent } from "@a2a-js/sdk";
import type { Envelope } from "./envelope.js";

function textPart(text: string): Part {
  return { content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" };
}

function dataPart(data: unknown): Part {
  return { content: { $case: "data", value: data }, metadata: undefined, filename: "", mediaType: "application/json" };
}

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
      id: this.taskId,
      contextId: this.contextId,
      status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() },
      artifacts: [],
      history: [userMessage],
      metadata: undefined,
    };
    this.bus.publish(AgentEvent.task(task));
  }

  /**
   * First event of a *resumed* stream. The server requires every execute()
   * call — including follow-up/resume calls — to publish a task or message
   * event before any status-update; republishing the already-persisted Task
   * (from RequestContext.task) satisfies that without re-adding history.
   */
  resumeTask(task: Task): void {
    this.bus.publish(AgentEvent.task(task));
  }

  private agentMessage(parts: Part[]): Message {
    return {
      messageId: randomUUID(),
      contextId: this.contextId,
      taskId: this.taskId,
      role: Role.ROLE_AGENT,
      parts,
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    };
  }

  private status(state: TaskState, message: Message | undefined): TaskStatusUpdateEvent {
    return {
      taskId: this.taskId,
      contextId: this.contextId,
      status: { state, message, timestamp: new Date().toISOString() },
      metadata: undefined,
    };
  }

  /** Non-final streaming envelope (task stays `working`). */
  emit(envelope: Envelope): void {
    if (this.settled) return;
    const message = this.agentMessage([dataPart(envelope)]);
    this.bus.publish(AgentEvent.statusUpdate(this.status(TaskState.TASK_STATE_WORKING, message)));
  }

  /** Terminal `completed` carrying the final assistant text. Idempotent. */
  complete(finalText: string): void {
    if (this.settled) return;
    this.settled = true;
    const message = this.agentMessage([textPart(finalText)]);
    this.bus.publish(AgentEvent.statusUpdate(this.status(TaskState.TASK_STATE_COMPLETED, message)));
    this.bus.finished();
  }

  /** Terminal `input-required` carrying an approval-request envelope (HITL). */
  inputRequired(envelope: Envelope): void {
    if (this.settled) return;
    this.settled = true;
    const message = this.agentMessage([dataPart(envelope)]);
    this.bus.publish(AgentEvent.statusUpdate(this.status(TaskState.TASK_STATE_INPUT_REQUIRED, message)));
    this.bus.finished();
  }

  /** Terminal `canceled`. Idempotent. */
  canceled(): void {
    if (this.settled) return;
    this.settled = true;
    this.bus.publish(AgentEvent.statusUpdate(this.status(TaskState.TASK_STATE_CANCELED, undefined)));
    this.bus.finished();
  }

  /** Terminal `failed` with a human-readable message. Idempotent. */
  failed(message: string): void {
    if (this.settled) return;
    this.settled = true;
    const agentMsg = this.agentMessage([textPart(message)]);
    this.bus.publish(AgentEvent.statusUpdate(this.status(TaskState.TASK_STATE_FAILED, agentMsg)));
    this.bus.finished();
  }
}
