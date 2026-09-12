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

test("an empty composer offers the mic and no Send", () => {
  setup();
  const composer = screen.getByTestId("composer-surface");
  const record = screen.getByRole("button", { name: "Record voice message" });
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  expect(composer.lastElementChild).toBe(record);
  expect(composer).toHaveAttribute("data-expanded", "false");
});

test("Send appears alongside the mic once there's something to send, and sends it", async () => {
  const { send } = setup();
  const user = userEvent.setup();

  await user.type(screen.getByRole("textbox", { name: "Ask anything" }), "hello");

  // Both, not either: voice input appends to an existing draft, so swapping the
  // mic out for Send would make dictation reachable only from an empty composer.
  expect(screen.getByRole("button", { name: "Record voice message" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(send).toHaveBeenCalledWith("hello", []);
});

test("Send is offered for an attachment with no text", () => {
  setup({ attachments: [{ file: new File(["x"], "a.png", { type: "image/png" }), previewUrl: "blob:x" }] });
  // submit() accepts this, so the UI has to offer a way to trigger it — on a soft
  // keyboard there is no Enter-to-send to fall back on.
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
});

test("on a touch device Enter inserts a newline instead of sending", async () => {
  // src/test/setup.ts stubs matchMedia to always report false, so the coarse-pointer
  // lane is invisible unless a test opts into it explicitly.
  const media = vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  const { send } = setup();
  const user = userEvent.setup();

  const box = screen.getByRole("textbox", { name: "Ask anything" });
  await user.type(box, "first line{Enter}second");

  // A soft keyboard has no Shift+Enter, so Enter has to stay a newline — Send is
  // the only way to submit, which is why it has to exist.
  expect(send).not.toHaveBeenCalled();
  expect(box).toHaveValue("first line\nsecond");
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  media.mockRestore();
});

test("while streaming the trailing control is Stop, not Send or the mic", async () => {
  const { send } = setup();
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Ask anything" }), "hi");
  useChatStore.setState({ isStreaming: true });

  expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record voice message" })).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});

test("pressing Enter calls send() with the typed text and clears the draft", async () => {
  const { send } = setup();
  const user = userEvent.setup();

  await user.type(screen.getByRole("textbox", { name: /ask anything/i }), "hello there");
  await user.keyboard("{Enter}");

  await waitFor(() => expect(send).toHaveBeenCalledWith("hello there", []));
  await waitFor(() => expect(screen.getByRole("textbox", { name: /ask anything/i })).toHaveValue(""));
});

test("Shift+Enter inserts a newline and plain Enter submits the multiline draft", async () => {
  const { send } = setup();
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: /ask anything/i });

  await user.type(input, "line one{Shift>}{Enter}{/Shift}line two");
  expect(send).not.toHaveBeenCalled();
  expect(input).toHaveValue("line one\nline two");

  await user.type(input, "{Enter}");
  await waitFor(() => expect(send).toHaveBeenCalledWith("line one\nline two", []));
});

test("shows a Stop button while streaming, which calls stop()", async () => {
  useChatStore.setState({ isStreaming: true });
  const { stop } = setup();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Stop" }));

  expect(stop).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record voice message" })).not.toBeInTheDocument();
});

test("a failed send shows an error and keeps the draft text intact", async () => {
  const send = vi.fn(async () => {
    throw new Error("network down");
  });
  setup({ send });
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: /ask anything/i });

  await user.type(input, "keep me");
  await user.keyboard("{Enter}");

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

test("pressing Enter sends a pending image without text", async () => {
  const attachment = { file: new File(["x"], "photo.png", { type: "image/png" }) };
  const { send } = setup({ attachments: [attachment] });
  const user = userEvent.setup();

  await user.click(screen.getByRole("textbox", { name: /ask anything/i }));
  await user.keyboard("{Enter}");

  await waitFor(() => expect(send).toHaveBeenCalledWith("", [attachment.file]));
});

test("attachments expand into a preview tray inside the composer", async () => {
  const attachment = {
    file: new File(["x"], "animals.jpg", { type: "image/jpeg" }),
    previewUrl: "blob:animals",
  };
  const { removeAttachment } = setup({ attachments: [attachment] });
  const user = userEvent.setup();
  const surface = screen.getByTestId("composer-surface");
  const tray = screen.getByRole("group", { name: "Message attachments" });

  expect(surface).toHaveAttribute("data-expanded", "true");
  expect(surface).toContainElement(tray);
  expect(screen.getByRole("textbox", { name: /ask anything/i })).toHaveAttribute("placeholder", "Ask anything...");
  expect(screen.getByAltText("")).toHaveAttribute("src", "blob:animals");
  expect(screen.getByText("animals.jpg")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Remove animals.jpg" }));
  expect(removeAttachment).toHaveBeenCalledWith(0);
});
