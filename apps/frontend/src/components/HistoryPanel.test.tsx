import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/history", () => ({
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  listConversations: vi.fn(),
}));

import { deleteConversation, getConversation, listConversations } from "../lib/history";
import type { ConversationSummary } from "../lib/history";
import { useChatStore } from "../store/chat";
import { HistoryPanel } from "./HistoryPanel";

function conv(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return { id: "c1", title: "First conversation", model: "m1", createdAt: Date.now(), updatedAt: Date.now(), ...overrides };
}

function renderPanel(open = true) {
  const ref = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const navigateToChat = vi.fn();
  const utils = render(<HistoryPanel open={open} onClose={onClose} triggerRef={ref} navigateToChat={navigateToChat} />);
  return { ...utils, onClose, navigateToChat };
}

beforeEach(() => {
  vi.mocked(listConversations).mockReset().mockResolvedValue([]);
  vi.mocked(getConversation).mockReset();
  vi.mocked(deleteConversation).mockReset().mockResolvedValue(undefined);
  useChatStore.setState({ turns: [], contextId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders nothing when closed", () => {
  const { container } = renderPanel(false);
  expect(container).toBeEmptyDOMElement();
});

test("shows an empty-state message when there are no conversations", async () => {
  renderPanel();
  await waitFor(() => expect(screen.getByText("No conversations yet.")).toBeInTheDocument());
});

test("lists conversations grouped under a Today heading", async () => {
  vi.mocked(listConversations).mockResolvedValue([conv()]);
  renderPanel();
  await waitFor(() => expect(screen.getByText("First conversation")).toBeInTheDocument());
  expect(screen.getByText("Today")).toBeInTheDocument();
});

test("typing a search query re-fetches (debounced) with that query", async () => {
  vi.mocked(listConversations).mockResolvedValue([]);
  const user = userEvent.setup();
  renderPanel();
  await waitFor(() => expect(listConversations).toHaveBeenCalledWith(""));

  await user.type(screen.getByRole("textbox", { name: /search conversations/i }), "needle");

  await waitFor(() => expect(listConversations).toHaveBeenCalledWith("needle"));
});

test("opening a conversation loads it into the store and navigates to chat", async () => {
  vi.mocked(listConversations).mockResolvedValue([conv()]);
  vi.mocked(getConversation).mockResolvedValue({ ...conv(), turns: [] });
  const user = userEvent.setup();
  const { navigateToChat, onClose } = renderPanel();

  await waitFor(() => expect(screen.getByText("First conversation")).toBeInTheDocument());
  await user.click(screen.getByText("First conversation"));

  await waitFor(() => expect(useChatStore.getState().contextId).toBe("c1"));
  expect(navigateToChat).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("a failed conversation load shows an error instead of navigating", async () => {
  vi.mocked(listConversations).mockResolvedValue([conv()]);
  vi.mocked(getConversation).mockRejectedValue(new Error("gone"));
  const user = userEvent.setup();
  const { navigateToChat } = renderPanel();

  await waitFor(() => expect(screen.getByText("First conversation")).toBeInTheDocument());
  await user.click(screen.getByText("First conversation"));

  await waitFor(() => expect(screen.getByText("gone")).toBeInTheDocument());
  expect(navigateToChat).not.toHaveBeenCalled();
});

test("delete requires a confirming second click", async () => {
  vi.mocked(listConversations).mockResolvedValue([conv()]);
  const user = userEvent.setup();
  renderPanel();
  await waitFor(() => expect(screen.getByText("First conversation")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "First conversation"' }));
  expect(screen.getByRole("button", { name: 'Confirm delete "First conversation"' })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Confirm delete "First conversation"' }));

  expect(deleteConversation).toHaveBeenCalledWith("c1");
  await waitFor(() => expect(screen.queryByText("First conversation")).not.toBeInTheDocument());
});

test("Escape closes the panel", async () => {
  const user = userEvent.setup();
  const { onClose } = renderPanel();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
