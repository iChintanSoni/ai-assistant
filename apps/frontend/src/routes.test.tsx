import { act, render, screen, waitFor } from "@testing-library/react";
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
  return { ...actual, deleteDocument: vi.fn(), getDocument: vi.fn(), registerDocument: vi.fn() };
});
vi.mock("./lib/attachments", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
  deleteAttachment: vi.fn(),
}));
vi.mock("./lib/modelManagement", () => ({
  fetchAllModels: vi.fn().mockResolvedValue({ models: [], defaultModel: "m1" }),
  setDefaultModel: vi.fn(),
  deleteModel: vi.fn(),
  pullModel: vi.fn(),
}));
vi.mock("./hooks/useChat", () => ({
  useChat: vi.fn(() => ({ send: vi.fn(), respond: vi.fn(), stop: vi.fn() })),
}));

import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { getConversation } from "./lib/history";
import { fetchModels } from "./lib/models";
import type { ModelInfo } from "./lib/models";
import { routes } from "./routes";
import { useChatStore } from "./store/chat";

function model(): ModelInfo {
  return { name: "m1", modalities: ["text"], tools: true, thinking: false, contextLength: null };
}

function detail(id = "c1") {
  return { id, model: "m1", turns: [], title: "A chat", createdAt: 0, updatedAt: 0 };
}

/** Mounts the real route table in a fresh memory router — one per test, so no history leaks between them. */
function renderAt(entries: string[], initialIndex?: number) {
  const router = createMemoryRouter(routes, {
    initialEntries: entries,
    ...(initialIndex === undefined ? {} : { initialIndex }),
  });
  return { ...render(<RouterProvider router={router} />), router };
}

beforeEach(() => {
  vi.mocked(fetchModels).mockReset().mockResolvedValue({ models: [model()], defaultModel: "m1" });
  vi.mocked(getConversation).mockReset();
  useChatStore.setState({
    turns: [],
    selectedModel: null,
    models: [],
    modelsError: null,
    contextId: null,
    activeTaskId: null,
    pendingTaskId: null,
    isStreaming: false,
    activeDocumentIds: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("the root path renders the chat hub", () => {
  renderAt(["/"]);
  expect(screen.getByText(/let's get started/)).toBeInTheDocument();
});

test("/files renders the Files gallery", async () => {
  renderAt(["/files"]);
  expect(await screen.findByRole("heading", { name: "Files" })).toBeInTheDocument();
});

test("/settings renders Settings", async () => {
  renderAt(["/settings"]);
  expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
});

test("an unknown path redirects to the chat hub instead of dead-ending", async () => {
  const { router } = renderAt(["/nope"]);
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(screen.getByText(/let's get started/)).toBeInTheDocument();
});

test("a deep-linked /c/:id restores that conversation", async () => {
  vi.mocked(getConversation).mockResolvedValue(detail("abc123"));
  renderAt(["/c/abc123"]);
  await waitFor(() => expect(useChatStore.getState().contextId).toBe("abc123"));
  expect(getConversation).toHaveBeenCalledWith("abc123");
});

test("a /c/:id that can't be restored falls back to a fresh chat at the hub, loudly", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getConversation).mockRejectedValue(new Error("not found"));
  useChatStore.setState({ contextId: "stale" });

  const { router } = renderAt(["/c/missing"]);

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(useChatStore.getState().contextId).toBeNull();
  expect(logged).toHaveBeenCalled();
});

test("the loader skips the fetch when that conversation is already the live one", async () => {
  useChatStore.setState({ contextId: "live" });
  renderAt(["/c/live"]);
  await waitFor(() => expect(screen.getByText(/let's get started/)).toBeInTheDocument());
  // Re-fetching here would overwrite an in-flight streaming turn — see conversationLoader.
  expect(getConversation).not.toHaveBeenCalled();
});

test("the rail navigates between the three views", async () => {
  const user = userEvent.setup();
  const { router } = renderAt(["/"]);

  await user.click(screen.getByRole("button", { name: "Files" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/files"));

  await user.click(screen.getByRole("button", { name: "Settings" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));

  await user.click(screen.getByRole("button", { name: "New chat" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
});

test("a contextId assigned mid-stream points the URL at the new conversation", async () => {
  const { router } = renderAt(["/"]);
  act(() => useChatStore.getState().setActiveTask("t1", "new-context"));
  await waitFor(() => expect(router.state.location.pathname).toBe("/c/new-context"));
  expect(getConversation).not.toHaveBeenCalled();
});

test("that mid-stream URL rewrite replaces the hub entry rather than stacking on it", async () => {
  const { router } = renderAt(["/files", "/"], 1);
  act(() => useChatStore.getState().setActiveTask("t1", "abc"));
  await waitFor(() => expect(router.state.location.pathname).toBe("/c/abc"));

  // Back skips straight past the hub the conversation grew out of.
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.pathname).toBe("/files");
});

test("back-navigation out of a conversation leaves a fresh chat behind", async () => {
  vi.mocked(getConversation).mockResolvedValue(detail("c1"));
  const { router } = renderAt(["/"]);

  await act(async () => {
    await router.navigate("/c/c1");
  });
  await waitFor(() => expect(useChatStore.getState().contextId).toBe("c1"));

  await act(async () => {
    await router.navigate(-1);
  });
  await waitFor(() => expect(useChatStore.getState().contextId).toBeNull());
  expect(router.state.location.pathname).toBe("/");
});

test("navigating to /files leaves the open conversation alone", async () => {
  const { router } = renderAt(["/"]);
  useChatStore.setState({ contextId: "keep-me" });

  await act(async () => {
    await router.navigate("/files");
  });

  expect(useChatStore.getState().contextId).toBe("keep-me");
});

test("landing on the hub with nothing open doesn't clobber a pre-seeded transcript", async () => {
  useChatStore.setState({
    turns: [{ id: "u1", role: "user", text: "hi", reasoning: "", tools: [], status: "complete" }],
  });
  renderAt(["/"]);
  expect(screen.queryByText(/let's get started/)).not.toBeInTheDocument();
});
