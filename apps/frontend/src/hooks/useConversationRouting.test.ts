import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/history", () => ({ getConversation: vi.fn() }));

import { getConversation } from "../lib/history";
import { useChatStore } from "../store/chat";
import { useConversationRouting } from "./useConversationRouting";

beforeEach(() => {
  window.history.pushState(null, "", "/");
  vi.mocked(getConversation).mockReset();
  useChatStore.setState({ turns: [], contextId: null, activeTaskId: null, pendingTaskId: null, isStreaming: false, activeDocumentIds: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("defaults to the chat view at the root path", () => {
  const { result } = renderHook(() => useConversationRouting());
  expect(result.current.view).toBe("chat");
});

test("starts on the files view when the URL is /files", () => {
  window.history.pushState(null, "", "/files");
  const { result } = renderHook(() => useConversationRouting());
  expect(result.current.view).toBe("files");
});

test("restores a conversation from a deep-linked /c/:id URL on mount", async () => {
  window.history.pushState(null, "", "/c/abc123");
  vi.mocked(getConversation).mockResolvedValue({ id: "abc123", model: "m1", turns: [], title: "t", createdAt: 0, updatedAt: 0 });

  renderHook(() => useConversationRouting());

  await waitFor(() => expect(useChatStore.getState().contextId).toBe("abc123"));
});

test("falls back to a fresh chat and resets the URL when restoring a conversation fails", async () => {
  window.history.pushState(null, "", "/c/missing");
  vi.mocked(getConversation).mockRejectedValue(new Error("not found"));
  useChatStore.setState({ contextId: "stale" });

  renderHook(() => useConversationRouting());

  await waitFor(() => expect(useChatStore.getState().contextId).toBeNull());
  expect(window.location.pathname).toBe("/");
});

test("navigateToFiles pushes /files and switches the view", () => {
  const { result } = renderHook(() => useConversationRouting());
  act(() => result.current.navigateToFiles());
  expect(result.current.view).toBe("files");
  expect(window.location.pathname).toBe("/files");
});

test("navigateToChat pushes to the active conversation's URL, or / if none is active", () => {
  const { result } = renderHook(() => useConversationRouting());
  act(() => result.current.navigateToFiles());
  act(() => result.current.navigateToChat());
  expect(result.current.view).toBe("chat");
  expect(window.location.pathname).toBe("/");

  useChatStore.setState({ contextId: "c1" });
  act(() => result.current.navigateToChat());
  expect(window.location.pathname).toBe("/c/c1");
});

test("a contextId change after mount pushes its URL and switches to the chat view", () => {
  const { result } = renderHook(() => useConversationRouting());
  act(() => result.current.navigateToFiles());

  act(() => useChatStore.getState().setActiveTask("t1", "new-context"));

  expect(window.location.pathname).toBe("/c/new-context");
  expect(result.current.view).toBe("chat");
});

test("browser back/forward re-syncs the view and loads the conversation at the new URL", async () => {
  const { result } = renderHook(() => useConversationRouting());
  vi.mocked(getConversation).mockResolvedValue({ id: "back1", model: "m1", turns: [], title: "t", createdAt: 0, updatedAt: 0 });

  window.history.pushState(null, "", "/c/back1");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));

  expect(result.current.view).toBe("chat");
  await waitFor(() => expect(useChatStore.getState().contextId).toBe("back1"));
});

test("popstate to a plain path with no conversation id starts a fresh chat", () => {
  const { result } = renderHook(() => useConversationRouting());
  useChatStore.setState({ contextId: "old" });

  window.history.pushState(null, "", "/");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));

  expect(useChatStore.getState().contextId).toBeNull();
  expect(result.current.view).toBe("chat");
});

test("popstate to /files does not start a fresh chat", () => {
  renderHook(() => useConversationRouting());
  useChatStore.setState({ contextId: "keep-me" });

  window.history.pushState(null, "", "/files");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));

  expect(useChatStore.getState().contextId).toBe("keep-me");
});
