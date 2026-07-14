import { beforeEach, describe, expect, test, vi } from "vitest";
import { useChatStore } from "./chat";
import type { ModelInfo } from "../lib/models";

function model(name: string): ModelInfo {
  return { name, modalities: ["text"], tools: true, thinking: false, contextLength: null };
}

beforeEach(() => {
  // No `replace` flag: a full replace would also wipe out the store's action
  // methods (setModels, beginTurn, ...), since they live on the same state object.
  useChatStore.setState({
    models: [],
    selectedModel: null,
    modelsError: null,
    contextId: null,
    activeTaskId: null,
    pendingTaskId: null,
    isStreaming: false,
    turns: [],
    activeDocumentIds: [],
  });
});

describe("setModels", () => {
  test("keeps the current selection if it's still in the new list", () => {
    useChatStore.setState({ selectedModel: "b" });
    useChatStore.getState().setModels([model("a"), model("b")], "a");
    expect(useChatStore.getState().selectedModel).toBe("b");
  });

  test("falls back to the default model when the current selection disappears", () => {
    useChatStore.setState({ selectedModel: "gone" });
    useChatStore.getState().setModels([model("a"), model("b")], "b");
    expect(useChatStore.getState().selectedModel).toBe("b");
  });

  test("falls back to the first model when neither the selection nor the default is present", () => {
    useChatStore.getState().setModels([model("a"), model("b")], "not-there");
    expect(useChatStore.getState().selectedModel).toBe("a");
  });

  test("clears modelsError on success", () => {
    useChatStore.setState({ modelsError: "boom" });
    useChatStore.getState().setModels([model("a")], "a");
    expect(useChatStore.getState().modelsError).toBeNull();
  });
});

test("setModelsError records the message", () => {
  useChatStore.getState().setModelsError("unreachable");
  expect(useChatStore.getState().modelsError).toBe("unreachable");
});

test("selectModel sets the selected model directly", () => {
  useChatStore.getState().selectModel("m2");
  expect(useChatStore.getState().selectedModel).toBe("m2");
});

test("newChat resets turns/context/task/document state", () => {
  useChatStore.setState({
    turns: [{ id: "1", role: "user", text: "hi", reasoning: "", tools: [], status: "complete" }],
    contextId: "c1",
    activeTaskId: "t1",
    isStreaming: true,
    activeDocumentIds: ["d1"],
  });
  useChatStore.getState().newChat();
  const s = useChatStore.getState();
  expect(s.turns).toEqual([]);
  expect(s.contextId).toBeNull();
  expect(s.activeTaskId).toBeNull();
  expect(s.isStreaming).toBe(false);
  expect(s.activeDocumentIds).toEqual([]);
});

test("loadConversation replaces turns/model/context and resets task/streaming state", () => {
  const turns = [{ id: "1", role: "user" as const, text: "hi", reasoning: "", tools: [], status: "complete" as const }];
  useChatStore.getState().loadConversation("c1", "m1", turns);
  const s = useChatStore.getState();
  expect(s.turns).toBe(turns);
  expect(s.contextId).toBe("c1");
  expect(s.selectedModel).toBe("m1");
  expect(s.activeDocumentIds).toEqual([]);
});

describe("active documents", () => {
  test("addActiveDocument appends without duplicating", () => {
    useChatStore.getState().addActiveDocument("d1");
    useChatStore.getState().addActiveDocument("d1");
    expect(useChatStore.getState().activeDocumentIds).toEqual(["d1"]);
  });

  test("removeActiveDocument removes only the given id", () => {
    useChatStore.setState({ activeDocumentIds: ["d1", "d2"] });
    useChatStore.getState().removeActiveDocument("d1");
    expect(useChatStore.getState().activeDocumentIds).toEqual(["d2"]);
  });
});

test("beginTurn appends a completed user turn and a streaming agent turn", () => {
  useChatStore.getState().beginTurn("hello", [], ["d1"]);
  const s = useChatStore.getState();
  expect(s.isStreaming).toBe(true);
  expect(s.turns).toHaveLength(2);
  expect(s.turns[0]).toMatchObject({ role: "user", text: "hello", status: "complete", documentIds: ["d1"] });
  expect(s.turns[1]).toMatchObject({ role: "agent", text: "", status: "streaming" });
});

test("beginTurn stamps the user turn's timestamp at send time; the agent turn has none yet", () => {
  useChatStore.getState().beginTurn("hello", [], []);
  const s = useChatStore.getState();
  expect(s.turns[0]!.timestamp).toEqual(expect.any(Number));
  expect(s.turns[1]!.timestamp).toBeUndefined();
});

test("beginTurn omits documentIds entirely when none are active", () => {
  useChatStore.getState().beginTurn("hello", [], []);
  expect(useChatStore.getState().turns[0]!.documentIds).toBeUndefined();
});

test("setActiveTask records the task/context ids", () => {
  useChatStore.getState().setActiveTask("t1", "c1");
  const s = useChatStore.getState();
  expect(s.activeTaskId).toBe("t1");
  expect(s.contextId).toBe("c1");
});

describe("applyEnvelope", () => {
  beforeEach(() => {
    useChatStore.getState().beginTurn("hi", [], []);
  });

  function lastAgentTurn() {
    const turns = useChatStore.getState().turns;
    return turns[turns.length - 1]!;
  }

  test("reasoning/text deltas append onto the last agent turn only", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "reasoning", delta: "thinking " });
    useChatStore.getState().applyEnvelope({ v: 1, type: "reasoning", delta: "more" });
    useChatStore.getState().applyEnvelope({ v: 1, type: "text", delta: "Hello " });
    useChatStore.getState().applyEnvelope({ v: 1, type: "text", delta: "world" });
    const agent = lastAgentTurn();
    expect(agent.reasoning).toBe("thinking more");
    expect(agent.text).toBe("Hello world");
  });

  test("a delta-less reasoning/text envelope is a no-op", () => {
    const before = lastAgentTurn();
    useChatStore.getState().applyEnvelope({ v: 1, type: "text" });
    expect(lastAgentTurn()).toEqual(before);
  });

  test("tool_call inserts a started tool entry, tool_result upserts by id into completed", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "tool_call", id: "tc1", name: "web_search", args: { q: "x" } });
    expect(lastAgentTurn().tools).toEqual([{ id: "tc1", name: "web_search", args: { q: "x" }, status: "started" }]);

    useChatStore.getState().applyEnvelope({ v: 1, type: "tool_result", id: "tc1", name: "web_search", output: "result" });
    expect(lastAgentTurn().tools).toEqual([{ id: "tc1", name: "web_search", args: { q: "x" }, output: "result", status: "completed" }]);
  });

  test("tool_result for an id never seen as tool_call still creates an entry", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "tool_result", id: "tc2", name: "web_search", output: "r" });
    expect(lastAgentTurn().tools).toEqual([{ id: "tc2", name: "web_search", output: "r", status: "completed" }]);
  });

  test("approval sets the pending requests on the last agent turn", () => {
    const requests = [{ name: "send_email", args: {}, allowedDecisions: ["approve", "reject"] }];
    useChatStore.getState().applyEnvelope({ v: 1, type: "approval", requests });
    expect(lastAgentTurn().approvals).toEqual(requests);
  });

  test("approval with no requests array defaults to []", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "approval" });
    expect(lastAgentTurn().approvals).toEqual([]);
  });

  test("subagent envelopes upsert by id across started -> completed", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "subagent", id: "s1", name: "researcher", args: "look this up", status: "started" });
    expect(lastAgentTurn().subagents).toEqual([{ id: "s1", name: "researcher", args: "look this up", output: undefined, usage: undefined, status: "started" }]);

    const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    useChatStore.getState().applyEnvelope({ v: 1, type: "subagent", id: "s1", output: "done", usage, status: "completed" });
    const sub = lastAgentTurn().subagents![0]!;
    expect(sub.status).toBe("completed");
    expect(sub.output).toBe("done");
    expect(sub.usage).toEqual(usage);
    expect(sub.name).toBe("researcher"); // preserved from the started patch
  });

  test("a subagent envelope with no prior name defaults to 'subagent'", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "subagent", id: "s2", status: "started" });
    expect(lastAgentTurn().subagents![0]!.name).toBe("subagent");
  });

  test("usage sets the turn's cumulative usage snapshot", () => {
    const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };
    useChatStore.getState().applyEnvelope({ v: 1, type: "usage", usage });
    expect(lastAgentTurn().usage).toEqual(usage);
  });

  test("a usage envelope with no usage payload is a no-op", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "usage" });
    expect(lastAgentTurn().usage).toBeUndefined();
  });

  test("compaction appends a compaction record with a generated id when none is given", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "compaction", output: "older history summarized" });
    const compactions = lastAgentTurn().compactions!;
    expect(compactions).toHaveLength(1);
    expect(compactions[0]!.summary).toBe("older history summarized");
  });

  test("a compaction envelope with empty/non-string output is a no-op", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "compaction", output: "" });
    expect(lastAgentTurn().compactions).toBeUndefined();
  });

  test("error marks the turn failed and records the message", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "error", output: "boom" });
    const agent = lastAgentTurn();
    expect(agent.status).toBe("failed");
    expect(agent.error).toBe("boom");
  });

  test("an unrecognized envelope type is a no-op", () => {
    const before = lastAgentTurn();
    useChatStore.getState().applyEnvelope({ v: 1, type: "unknown-type" as never });
    expect(lastAgentTurn()).toEqual(before);
  });
});

describe("finishTurn", () => {
  beforeEach(() => {
    useChatStore.getState().beginTurn("hi", [], []);
  });

  test("sets status and clears streaming/activeTaskId", () => {
    useChatStore.setState({ isStreaming: true, activeTaskId: "t1" });
    useChatStore.getState().finishTurn("complete", "final answer");
    const s = useChatStore.getState();
    expect(s.isStreaming).toBe(false);
    expect(s.activeTaskId).toBeNull();
    const agent = s.turns[s.turns.length - 1]!;
    expect(agent.status).toBe("complete");
    expect(agent.text).toBe("final answer");
  });

  test("keeps the already-streamed text when finalText is blank", () => {
    useChatStore.getState().applyEnvelope({ v: 1, type: "text", delta: "streamed" });
    useChatStore.getState().finishTurn("complete", "   ");
    expect(useChatStore.getState().turns.at(-1)!.text).toBe("streamed");
  });

  test("records an error message on failure", () => {
    useChatStore.getState().finishTurn("failed", undefined, "it broke");
    expect(useChatStore.getState().turns.at(-1)!.error).toBe("it broke");
  });

  test.each(["complete", "failed", "canceled"] as const)(
    "stamps the agent turn's timestamp when it finishes as %s, overwriting any earlier value",
    (status) => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000);
        useChatStore.getState().finishTurn(status);
        expect(useChatStore.getState().turns.at(-1)!.timestamp).toBe(1_000);

        vi.setSystemTime(5_000);
        useChatStore.getState().finishTurn(status);
        expect(useChatStore.getState().turns.at(-1)!.timestamp).toBe(5_000);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe("HITL pause/resume", () => {
  test("pauseForApproval stashes the active task as pending and marks the turn input-required", () => {
    useChatStore.getState().beginTurn("hi", [], []);
    useChatStore.getState().setActiveTask("t1", "c1");
    useChatStore.getState().pauseForApproval();
    const s = useChatStore.getState();
    expect(s.isStreaming).toBe(false);
    expect(s.pendingTaskId).toBe("t1");
    expect(s.activeTaskId).toBeNull();
    expect(s.turns.at(-1)!.status).toBe("input-required");
  });

  test("resumeForDecision restores the task id and clears prior approvals", () => {
    useChatStore.getState().beginTurn("hi", [], []);
    useChatStore.getState().applyEnvelope({ v: 1, type: "approval", requests: [] });
    useChatStore.setState({ pendingTaskId: "t1" });
    useChatStore.getState().resumeForDecision();
    const s = useChatStore.getState();
    expect(s.isStreaming).toBe(true);
    expect(s.activeTaskId).toBe("t1");
    expect(s.pendingTaskId).toBeNull();
    const agent = s.turns.at(-1)!;
    expect(agent.status).toBe("streaming");
    expect(agent.approvals).toBeUndefined();
  });
});
