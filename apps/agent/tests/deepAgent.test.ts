import { beforeEach, expect, test, vi } from "vitest";

vi.mock("deepagents", () => ({ createDeepAgent: vi.fn() }));
vi.mock("@langchain/ollama", () => ({ ChatOllama: vi.fn() }));
vi.mock("../src/agent/checkpointer.js", () => ({ getCheckpointer: vi.fn() }));
vi.mock("../src/agent/tools.js", () => ({
  getTools: vi.fn(() => []),
  RISKY_TOOLS: ["send_email", "run_javascript", "generate_image"],
}));
vi.mock("../src/agent/backends.js", () => ({ buildBackend: vi.fn() }));
vi.mock("../src/agent/subagents.js", () => ({ getSubagents: vi.fn(() => []) }));
vi.mock("../src/agent/middleware.js", () => ({ ollamaToolContentFix: { name: "ollamaToolContentFix" } }));
vi.mock("../src/agent/models.js", () => ({ describeModel: vi.fn() }));

import { createDeepAgent } from "deepagents";
import { ChatOllama } from "@langchain/ollama";
import { getCheckpointer } from "../src/agent/checkpointer.js";
import { buildBackend } from "../src/agent/backends.js";
import { describeModel } from "../src/agent/models.js";
import { buildAgent } from "../src/agent/deepAgent.js";
import { config } from "../src/config.js";

interface FakeModel {
  profile?: unknown;
}

let modelInstances: FakeModel[] = [];

function mockModelInfo(contextLength: number | null) {
  vi.mocked(describeModel).mockResolvedValue({
    name: "m",
    modalities: ["text"],
    tools: true,
    thinking: false,
    contextLength,
    eligible: true,
  });
}

beforeEach(() => {
  modelInstances = [];
  vi.mocked(createDeepAgent).mockReset().mockImplementation((async (opts: unknown) => ({ __opts: opts })) as never);
  vi.mocked(ChatOllama).mockReset().mockImplementation(function (opts: unknown) {
    const instance: FakeModel & { __opts: unknown } = { __opts: opts };
    modelInstances.push(instance);
    return instance as never;
  } as never);
  vi.mocked(getCheckpointer).mockReset().mockReturnValue({ __checkpointer: true } as never);
  vi.mocked(buildBackend).mockReset().mockReturnValue({ __backend: true } as never);
  vi.mocked(describeModel).mockReset();
});

test("buildAgent resolves numCtx from describeModel's contextLength and passes it to ChatOllama", async () => {
  mockModelInfo(8192);
  await buildAgent("model-numctx");
  expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({ model: "model-numctx", numCtx: 8192 }));
});

test("buildAgent leaves numCtx undefined when the model's context length can't be determined", async () => {
  mockModelInfo(null);
  await buildAgent("model-nocontext");
  expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({ model: "model-nocontext", numCtx: undefined }));
});

test("buildAgent clamps numCtx to config.maxContextTokens when set", async () => {
  const original = config.maxContextTokens;
  (config as { maxContextTokens?: number }).maxContextTokens = 4096;
  try {
    mockModelInfo(100000);
    await buildAgent("model-clamped");
    expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({ numCtx: 4096 }));
  } finally {
    (config as { maxContextTokens?: number }).maxContextTokens = original;
  }
});

test("buildAgent overrides the model's .profile with maxInputTokens when numCtx is resolved", async () => {
  mockModelInfo(2048);
  await buildAgent("model-profile");
  expect(modelInstances[0]!.profile).toEqual({ maxInputTokens: 2048 });
});

test("buildAgent doesn't set .profile when numCtx couldn't be resolved", async () => {
  mockModelInfo(null);
  await buildAgent("model-noprofile");
  expect(modelInstances[0]!.profile).toBeUndefined();
});

test("buildAgent caches the agent per model name (createDeepAgent called once for repeat calls)", async () => {
  mockModelInfo(1024);
  const a = await buildAgent("model-cached");
  const b = await buildAgent("model-cached");
  expect(a).toBe(b);
  expect(createDeepAgent).toHaveBeenCalledTimes(1);
});

test("buildAgent builds a distinct agent per distinct model name", async () => {
  mockModelInfo(1024);
  await buildAgent("model-distinct-a");
  await buildAgent("model-distinct-b");
  expect(createDeepAgent).toHaveBeenCalledTimes(2);
});

test("buildAgent wires checkpointer/backend/interruptOn into createDeepAgent", async () => {
  mockModelInfo(null);
  await buildAgent("model-wiring");
  const [opts] = vi.mocked(createDeepAgent).mock.calls[0]!;
  expect((opts as { checkpointer: unknown }).checkpointer).toEqual({ __checkpointer: true });
  expect((opts as { backend: unknown }).backend).toEqual({ __backend: true });
  expect(Object.keys((opts as { interruptOn: Record<string, unknown> }).interruptOn)).toEqual([
    "send_email",
    "run_javascript",
    "generate_image",
  ]);
});
