/**
 * Keeps the URL in sync with the active view: `/` is the empty hub, `/c/:id`
 * is an open conversation, `/files` is the Files gallery page. Handles deep
 * links/refresh (restore from URL on mount) and browser back/forward, using
 * the native History API — there are only ever three "pages" here, so a
 * router dependency isn't needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getConversation } from "../lib/history";
import { useChatStore } from "../store/chat";

export type RouteView = "chat" | "files";

function conversationIdFromPath(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function viewFromPath(pathname: string): RouteView {
  return pathname === "/files" ? "files" : "chat";
}

async function loadFromUrl(id: string): Promise<void> {
  try {
    const detail = await getConversation(id);
    useChatStore.getState().loadConversation(detail.id, detail.model, detail.turns);
  } catch (err) {
    console.error("Failed to restore conversation from URL:", err);
    useChatStore.getState().newChat();
    window.history.replaceState(null, "", "/");
  }
}

export function useConversationRouting(): { view: RouteView; navigateToFiles: () => void; navigateToChat: () => void } {
  const contextId = useChatStore((s) => s.contextId);
  const lastSynced = useRef<string | null | undefined>(undefined);
  const [view, setView] = useState<RouteView>(() => viewFromPath(window.location.pathname));

  // Restore from the URL once on mount (deep link or refresh). `view` is
  // already correct from the lazy useState initializer above.
  useEffect(() => {
    const id = conversationIdFromPath(window.location.pathname);
    if (id) void loadFromUrl(id);
  }, []);

  // Push the URL whenever the active conversation changes (first reply, history
  // switch, "New chat"). Skipped on the very first run so it never fights the
  // mount-restore above. This is a safety net for contextId changes with no
  // explicit navigate call (e.g. the agent assigning a contextId mid-stream for
  // a brand-new chat) — `navigateToChat`/`navigateToFiles` below handle the
  // explicit, user-driven transitions (including the Files page) directly.
  useEffect(() => {
    if (lastSynced.current === undefined) {
      lastSynced.current = contextId;
      return;
    }
    if (contextId === lastSynced.current) return;
    lastSynced.current = contextId;
    const target = contextId ? `/c/${contextId}` : "/";
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
    setView("chat");
  }, [contextId]);

  // Browser back/forward.
  useEffect(() => {
    function onPopState() {
      const pathname = window.location.pathname;
      setView(viewFromPath(pathname));
      const id = conversationIdFromPath(pathname);
      if (id) void loadFromUrl(id);
      else if (pathname !== "/files") useChatStore.getState().newChat();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateToFiles = useCallback(() => {
    if (window.location.pathname !== "/files") window.history.pushState(null, "", "/files");
    setView("files");
  }, []);

  // Called alongside `newChat()`/`loadConversation()` so the Files page is
  // left immediately, even in the rare case the target contextId happens to
  // match whatever was already active before navigating to `/files`.
  const navigateToChat = useCallback(() => {
    const { contextId: current } = useChatStore.getState();
    const target = current ? `/c/${current}` : "/";
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
    setView("chat");
  }, []);

  return { view, navigateToFiles, navigateToChat };
}
