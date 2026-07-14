/** DeepAgentExecutor: the A2A AgentExecutor that drives the deep agent (+ HITL). */
import { Command } from "@langchain/langgraph";
import type { AgentExecutor, ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";
import type { Message } from "@a2a-js/sdk";
import { A2APublisher } from "./publisher.js";
import { runAgentToEvents, type HITLRequestValue, type TurnUsage } from "./streaming.js";
import type { ApprovalRequest, Envelope } from "./envelope.js";
import { buildAgent } from "../agent/deepAgent.js";
import { describeModel, getDefaultModel } from "../agent/models.js";
import { extractDocumentIds, extractModel, prependNote, toLangChainContent, validateParts } from "../agent/parts.js";
import { getDocumentsByIds } from "../agent/documentStore.js";

interface RunRecord {
  controller: AbortController;
  publisher: A2APublisher;
}

/** A resume/decision message carries a DataPart of this shape. */
function extractDecisions(message: Message): unknown[] | null {
  for (const part of message.parts) {
    if (part.kind === "data") {
      const data = part.data as { type?: unknown; decisions?: unknown };
      if (data?.type === "decision" && Array.isArray(data.decisions)) return data.decisions;
    }
  }
  return null;
}

/**
 * Builds the human-message content for a fresh turn, prepending a note listing
 * which documents are active in this conversation (if any) so the model has
 * their IDs available to pass into search_documents/summarize_document —
 * the same instruction+tool-call pattern /memories/ already uses, rather than
 * deep-wiring document scope into the tool-call plumbing itself.
 */
async function buildTurnContent(userMessage: Message) {
  const content = await toLangChainContent(userMessage.parts);
  const documentIds = extractDocumentIds(userMessage);
  if (documentIds.length === 0) return content;

  const docs = getDocumentsByIds(documentIds);
  if (docs.length === 0) return content;

  const note =
    "Active documents for this conversation (pass these IDs to search_documents/summarize_document/" +
    "view_document_page when relevant):\n" +
    docs.map((d) => `- ${d.originalName} (id: ${d.id})`).join("\n");
  return prependNote(content, note);
}

/** Turn a HITL interrupt into an `approval` envelope for the client. */
function approvalEnvelope(interrupt: HITLRequestValue): Envelope {
  const allowedByAction = new Map(
    (interrupt.reviewConfigs ?? []).map((c) => [c.actionName, c.allowedDecisions]),
  );
  const requests: ApprovalRequest[] = (interrupt.actionRequests ?? []).map((a) => ({
    name: a.name,
    args: a.args,
    description: a.description,
    allowedDecisions: allowedByAction.get(a.name) ?? ["approve", "reject"],
  }));
  return { v: 1, type: "approval", requests };
}

export class DeepAgentExecutor implements AgentExecutor {
  /** taskId -> in-flight run, so cancelTask can abort it. */
  private readonly runs = new Map<string, RunRecord>();

  execute = async (ctx: RequestContext, eventBus: ExecutionEventBus): Promise<void> => {
    const { userMessage, taskId, contextId } = ctx;
    const publisher = new A2APublisher(eventBus, taskId, contextId);
    const controller = new AbortController();
    this.runs.set(taskId, { controller, publisher });
    let usage: TurnUsage | null = null;

    try {
      const decisions = extractDecisions(userMessage);
      const isResume = decisions !== null;
      const modelName = extractModel(userMessage) ?? getDefaultModel();

      // For a fresh turn: validate the model + uploads, and open the task.
      // For a resume: the task already exists and its thread state is checkpointed.
      if (!isResume) {
        const model = await describeModel(modelName);
        if (!model.eligible) {
          publisher.failed(`Model "${modelName}" can't orchestrate: it doesn't support tool-calling.`);
          return;
        }
        const violation = validateParts(userMessage.parts, model.modalities);
        if (violation) {
          publisher.failed(violation);
          return;
        }
        publisher.startTask(userMessage);
      }

      const agent = await buildAgent(modelName);
      const input = isResume
        ? new Command({ resume: { decisions } })
        : { messages: [{ role: "user", content: await buildTurnContent(userMessage) }] };

      const result = await runAgentToEvents({
        agent,
        input,
        threadId: contextId,
        signal: controller.signal,
        publisher,
      });
      const { finalText, interrupt, compaction } = result;
      usage = result.usage;

      if (controller.signal.aborted) return; // cancelTask emits the terminal event
      if (usage) publisher.emit({ v: 1, type: "usage", usage });
      if (compaction) publisher.emit({ v: 1, type: "compaction", output: compaction.summary, status: "completed" });
      if (interrupt) {
        publisher.inputRequired(approvalEnvelope(interrupt));
        return;
      }
      publisher.complete(finalText || "(no response)");
    } catch (err) {
      if (controller.signal.aborted) return;
      if (usage) publisher.emit({ v: 1, type: "usage", usage });
      publisher.failed(`Agent error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.runs.delete(taskId);
    }
  };

  cancelTask = async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    const run = this.runs.get(taskId);
    if (!run) {
      new A2APublisher(eventBus, taskId, taskId).canceled();
      return;
    }
    run.controller.abort();
    run.publisher.canceled();
    this.runs.delete(taskId);
  };
}
