import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("./lib/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/models")>();
  return { ...actual, fetchModels: vi.fn() };
});
vi.mock("./lib/history", () => ({
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  listConversations: vi.fn().mockResolvedValue([]),
  saveConversation: vi.fn(),
}));
vi.mock("./lib/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/documents")>();
  return {
    ...actual,
    listDocuments: vi.fn().mockResolvedValue([]),
    deleteDocument: vi.fn(),
    getDocument: vi.fn(),
    registerDocument: vi.fn(),
  };
});
vi.mock("./lib/attachments", () => ({ listAttachments: vi.fn().mockResolvedValue([]), deleteAttachment: vi.fn() }));
vi.mock("./hooks/useChat", () => ({ useChat: vi.fn(() => ({ send: vi.fn(), respond: vi.fn(), stop: vi.fn() })) }));

import { fetchModels } from "./lib/models";
import { useChatStore } from "./store/chat";
import App from "./App";
import type { ModelInfo } from "./lib/models";

function model(): ModelInfo {
  return { name: "m1", modalities: ["text"], tools: true, thinking: false, contextLength: null };
}

beforeEach(() => {
  vi.mocked(fetchModels).mockReset().mockResolvedValue({ models: [model()], defaultModel: "m1" });
  useChatStore.setState({ turns: [], selectedModel: null, models: [], modelsError: null, contextId: null, activeDocumentIds: [] });
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("fetches models on mount and populates the store", async () => {
  render(<App />);
  await waitFor(() => expect(useChatStore.getState().models).toHaveLength(1));
  expect(useChatStore.getState().selectedModel).toBe("m1");
});

test("shows an error note when fetching models fails", async () => {
  vi.mocked(fetchModels).mockRejectedValue(new Error("agent unreachable"));
  render(<App />);
  await waitFor(() => expect(screen.getByText(/agent unreachable/)).toBeInTheDocument());
});

test("shows the empty-state greeting when there's no conversation yet", () => {
  render(<App />);
  expect(screen.getByText(/let's get started/)).toBeInTheDocument();
});

test("shows the conversation transcript instead of the greeting once turns exist", () => {
  useChatStore.setState({ turns: [{ id: "u1", role: "user", text: "hi", reasoning: "", tools: [], status: "complete" }] });
  render(<App />);
  expect(screen.queryByText(/let's get started/)).not.toBeInTheDocument();
});

test("the Files rail button switches to the Files page, and New chat switches back", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "Files" }));
  expect(screen.getByRole("heading", { name: "Files" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.queryByRole("heading", { name: "Files" })).not.toBeInTheDocument();
});

test("History and Documents panel toggles are mutually exclusive", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "History" }));
  expect(screen.getByRole("dialog", { name: "Conversation history" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Documents" }));
  expect(screen.queryByRole("dialog", { name: "Conversation history" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Document library" })).toBeInTheDocument();
});

test("the Settings rail button opens the settings panel", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "Settings" }));

  expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
});
