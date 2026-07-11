import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { useChatStore, type UITurn } from "../store/chat";
import { UsageGauge } from "./UsageGauge";
import type { ModelInfo } from "../lib/models";

function model(contextLength: number | null): ModelInfo {
  return { name: "m1", modalities: ["text"], tools: true, thinking: false, contextLength };
}

function agentTurn(overrides: Partial<UITurn> = {}): UITurn {
  return { id: "a1", role: "agent", text: "hi", reasoning: "", tools: [], status: "complete", ...overrides };
}

beforeEach(() => {
  useChatStore.setState({ models: [], selectedModel: null, turns: [] });
});

test("shows a plain gauge button when context length is unknown", () => {
  useChatStore.setState({ models: [model(null)], selectedModel: "m1" });
  render(<UsageGauge />);
  expect(screen.getByRole("button", { name: "Context usage" })).toBeInTheDocument();
});

test("opens a popover explaining there's no usage data yet", async () => {
  useChatStore.setState({ models: [model(8000)], selectedModel: "m1" });
  const user = userEvent.setup();
  render(<UsageGauge />);

  await user.click(screen.getByRole("button", { name: "Context usage" }));

  expect(screen.getByText(/No usage data yet/)).toBeInTheDocument();
});

test("shows the cumulative usage percentage once a turn reports usage", async () => {
  useChatStore.setState({
    models: [model(1000)],
    selectedModel: "m1",
    turns: [agentTurn({ usage: { inputTokens: 400, outputTokens: 100, totalTokens: 500 } })],
  });
  const user = userEvent.setup();
  render(<UsageGauge />);

  expect(screen.getByRole("button", { name: /50% used/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /50% used/ }));
  expect(screen.getByText(/500 \/ 1\.0K tokens \(50%\)/)).toBeInTheDocument();
});

test("shows per-subagent usage breakdown when present", async () => {
  useChatStore.setState({
    models: [model(1000)],
    selectedModel: "m1",
    turns: [
      agentTurn({
        usage: { inputTokens: 400, outputTokens: 100, totalTokens: 500 },
        subagents: [{ id: "s1", name: "researcher", status: "completed", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }],
      }),
    ],
  });
  const user = userEvent.setup();
  render(<UsageGauge />);
  await user.click(screen.getByRole("button", { name: /used/ }));

  expect(screen.getByText(/researcher:/)).toBeInTheDocument();
});
