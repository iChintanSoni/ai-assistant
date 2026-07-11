import { expect, test } from "vitest";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ollamaToolContentFix } from "../src/agent/middleware.js";

interface FakeRequest {
  messages: unknown[];
}

test("flattens array tool-message content to a string, leaving other messages untouched", async () => {
  const human = new HumanMessage("hi");
  const tool = new ToolMessage({ content: [{ type: "text", text: "result" }], tool_call_id: "t1", name: "read_file" });
  const request: FakeRequest = { messages: [human, tool] };

  const result = (await ollamaToolContentFix.wrapModelCall(request as never, (async (r: FakeRequest) => r) as never)) as FakeRequest;

  expect(result.messages[0]).toBe(human);
  expect((result.messages[1] as ToolMessage).content).toBe("result");
});

test("passes the request through with the same references when no tool message needs flattening", async () => {
  const tool = new ToolMessage({ content: "already a string", tool_call_id: "t2" });
  const request: FakeRequest = { messages: [tool] };

  const result = await ollamaToolContentFix.wrapModelCall(request as never, (async (r: FakeRequest) => r) as never);

  expect(result).toBe(request);
});

test("joins multiple content blocks with newlines and JSON-stringifies non-text blocks", async () => {
  const tool = new ToolMessage({
    content: ["plain string block", { type: "other", value: 42 }],
    tool_call_id: "t3",
  });
  const request: FakeRequest = { messages: [tool] };

  const result = (await ollamaToolContentFix.wrapModelCall(request as never, (async (r: FakeRequest) => r) as never)) as FakeRequest;

  expect((result.messages[0] as ToolMessage).content).toBe('plain string block\n{"type":"other","value":42}');
});
