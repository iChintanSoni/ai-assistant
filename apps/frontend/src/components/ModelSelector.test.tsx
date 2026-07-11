import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { useChatStore } from "../store/chat";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo } from "../lib/models";

function model(name: string, overrides: Partial<ModelInfo> = {}): ModelInfo {
  return { name, modalities: ["text"], tools: true, thinking: false, contextLength: null, ...overrides };
}

beforeEach(() => {
  useChatStore.setState({ models: [], selectedModel: null });
});

test("shows 'No models' and is disabled when there are none", () => {
  render(<ModelSelector />);
  expect(screen.getByRole("button", { name: /no models/i })).toBeDisabled();
});

test("shows the selected model name and opens a listbox of choices with capability badges", async () => {
  useChatStore.setState({ models: [model("alpha"), model("vision-model", { modalities: ["text", "image"] })], selectedModel: "alpha" });
  const user = userEvent.setup();

  render(<ModelSelector />);
  expect(screen.getByText("alpha")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /alpha/i }));
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /alpha/i })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("vision")).toBeInTheDocument();
});

test("selecting a model updates the store and closes the dropdown", async () => {
  useChatStore.setState({ models: [model("alpha"), model("beta")], selectedModel: "alpha" });
  const user = userEvent.setup();

  render(<ModelSelector />);
  await user.click(screen.getByRole("button", { name: /alpha/i }));
  // The onClick handler lives on the <button> nested inside the <li role="option">,
  // not the option element itself, so the click must target that inner button.
  await user.click(screen.getByRole("button", { name: "beta" }));

  expect(useChatStore.getState().selectedModel).toBe("beta");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("clicking outside closes the dropdown", async () => {
  useChatStore.setState({ models: [model("alpha")], selectedModel: "alpha" });
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">outside</button>
      <ModelSelector />
    </div>,
  );
  await user.click(screen.getByRole("button", { name: /alpha/i }));
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "outside" }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("Escape closes the dropdown", async () => {
  useChatStore.setState({ models: [model("alpha")], selectedModel: "alpha" });
  const user = userEvent.setup();
  render(<ModelSelector />);
  await user.click(screen.getByRole("button", { name: /alpha/i }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
