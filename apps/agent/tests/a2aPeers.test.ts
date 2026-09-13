import { beforeEach, expect, test, vi } from "vitest";

const sendMessage = vi.fn();
const createFromUrl = vi.fn().mockResolvedValue({ sendMessage });

vi.mock("@a2a-js/sdk/client", () => ({
  ClientFactory: vi.fn().mockImplementation(function ClientFactory(this: { createFromUrl: typeof createFromUrl }) {
    this.createFromUrl = createFromUrl;
  }),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn() },
}));

import fs from "node:fs";
import { TaskState, type Message, type Task } from "@a2a-js/sdk";
import { getA2APeerTools } from "../src/agent/a2aPeers.js";

function messageResult(text: string): Message {
  return {
    messageId: "reply-1",
    contextId: "",
    taskId: "",
    role: 2, // Role.ROLE_AGENT
    parts: [{ content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" }],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  } as unknown as Message;
}

function taskResult(state: TaskState, text?: string): Task {
  return {
    id: "peer-task-1",
    contextId: "peer-ctx-1",
    status: {
      state,
      message:
        text === undefined
          ? undefined
          : {
              messageId: "status-msg",
              contextId: "peer-ctx-1",
              taskId: "peer-task-1",
              role: 2, // Role.ROLE_AGENT
              parts: [{ content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" }],
              metadata: undefined,
              extensions: [],
              referenceTaskIds: [],
            },
      timestamp: "t",
    },
    artifacts: [],
    history: [],
    metadata: undefined,
  };
}

function stubPeers(peers: Array<{ name: string; description: string; url: string }>): void {
  vi.mocked(fs.existsSync).mockReturnValue(peers.length > 0);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(peers) as never);
}

beforeEach(() => {
  sendMessage.mockReset();
  createFromUrl.mockClear();
  vi.mocked(fs.existsSync).mockReset();
  vi.mocked(fs.readFileSync).mockReset();
});

test("returns no tools when no peers are configured", () => {
  stubPeers([]);
  expect(getA2APeerTools()).toEqual([]);
});

test("returns one delegate_to_<name> tool per configured peer", () => {
  stubPeers([
    { name: "researcher", description: "Deep research", url: "http://peer/a2a" },
    { name: "planner", description: "Trip planning", url: "http://peer2/a2a" },
  ]);

  const tools = getA2APeerTools();

  expect(tools.map((t) => t.name)).toEqual(["delegate_to_researcher", "delegate_to_planner"]);
});

test("delegate returns a Message reply's text", async () => {
  stubPeers([{ name: "researcher", description: "Deep research", url: "http://peer/a2a" }]);
  sendMessage.mockResolvedValue(messageResult("here's what I found"));

  const [tool] = getA2APeerTools();
  const result = await tool!.invoke({ task: "look into X" });

  expect(createFromUrl).toHaveBeenCalledWith("http://peer/a2a");
  expect(result).toBe("here's what I found");
});

test("delegate extracts the status message text from a completed Task reply", async () => {
  stubPeers([{ name: "researcher", description: "Deep research", url: "http://peer/a2a" }]);
  sendMessage.mockResolvedValue(taskResult(TaskState.TASK_STATE_COMPLETED, "task reply text"));

  const [tool] = getA2APeerTools();
  const result = await tool!.invoke({ task: "look into X" });

  expect(result).toBe("task reply text");
});

test("delegate reports a non-completed, textless Task as needing human approval on the peer's end", async () => {
  stubPeers([{ name: "researcher", description: "Deep research", url: "http://peer/a2a" }]);
  sendMessage.mockResolvedValue(taskResult(TaskState.TASK_STATE_INPUT_REQUIRED));

  const [tool] = getA2APeerTools();
  const result = await tool!.invoke({ task: "look into X" });

  expect(result).toMatch(/did not return a completed result/);
  expect(result).toMatch(/human approval/);
});

test("delegate catches client/transport errors and reports them as the tool's result", async () => {
  stubPeers([{ name: "researcher", description: "Deep research", url: "http://peer/a2a" }]);
  sendMessage.mockRejectedValue(new Error("ECONNREFUSED"));

  const [tool] = getA2APeerTools();
  const result = await tool!.invoke({ task: "look into X" });

  expect(result).toBe('Delegation to "researcher" failed: ECONNREFUSED');
});
