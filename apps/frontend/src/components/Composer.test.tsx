import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../hooks/useChat", () => ({ useChat: vi.fn() }));

import { useChat } from "../hooks/useChat";
import { useChatStore } from "../store/chat";
import { Composer } from "./Composer";
import type { PendingAttachment } from "../hooks/useAttachments";
import type { ModelInfo } from "../lib/models";

function model(): ModelInfo {
  return { name: "m1", modalities: ["text", "image"], tools: true, thinking: false, contextLength: null };
}

function setup(overrides: { attachments?: PendingAttachment[]; notice?: string | null; send?: (text: string, files: File[]) => Promise<void> } = {}) {
  const send = overrides.send ?? vi.fn(async () => {});
  const stop = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useChat).mockReturnValue({ send, respond: vi.fn(), stop });
  const addFiles = vi.fn();
  const removeAttachment = vi.fn();
  const clear = vi.fn();
  const utils = render(
    <Composer attachments={overrides.attachments ?? []} notice={overrides.notice ?? null} addFiles={addFiles} removeAttachment={removeAttachment} clear={clear} />,
  );
  return { ...utils, send, stop, addFiles, removeAttachment, clear };
}

beforeEach(() => {
  useChatStore.setState({ isStreaming: false, selectedModel: "m1", models: [model()] });
});

test("the send button is disabled until there's text or an attachment", async () => {
  setup();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: /ask anything/i }), "hi");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("clicking Send calls send() with the typed text and clears the draft", async () => {
  const { send } = setup();
  const user = userEvent.setup();

  await user.type(screen.getByRole("textbox", { name: /ask anything/i }), "hello there");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(send).toHaveBeenCalledWith("hello there", []));
  await waitFor(() => expect(screen.getByRole("textbox", { name: /ask anything/i })).toHaveValue(""));
});

test("pressing Enter submits, but Shift+Enter does not", async () => {
  const { send } = setup();
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: /ask anything/i });

  await user.type(input, "line one{Shift>}{Enter}{/Shift}line two");
  expect(send).not.toHaveBeenCalled();

  await user.type(input, "{Enter}");
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
});

test("shows a Stop button while streaming, which calls stop()", async () => {
  useChatStore.setState({ isStreaming: true });
  const { stop } = setup();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Stop" }));

  expect(stop).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
});

test("a failed send shows an error and keeps the draft text intact", async () => {
  const send = vi.fn(async () => {
    throw new Error("network down");
  });
  setup({ send });
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: /ask anything/i });

  await user.type(input, "keep me");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  expect(input).toHaveValue("keep me");
});

test("shows the notice prop when there's no send error", () => {
  setup({ notice: "Only 5 files can be attached at once" });
  expect(screen.getByText("Only 5 files can be attached at once")).toBeInTheDocument();
});

test("choosing files via the hidden file input calls addFiles", async () => {
  const { addFiles } = setup();
  const file = new File(["x"], "a.png", { type: "image/png" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const user = userEvent.setup();

  await user.upload(input, file);

  expect(addFiles).toHaveBeenCalledWith([file]);
});

test("a pending attachment still counts toward enabling Send", () => {
  setup({ attachments: [{ file: new File(["x"], "notes.pdf", { type: "application/pdf" }) }] });
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});
