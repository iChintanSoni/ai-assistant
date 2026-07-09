/**
 * Keeps the URL in sync with the active conversation: `/` is the empty hub,
 * `/c/:id` is an open conversation. Handles deep links/refresh (restore from
 * URL on mount) and browser back/forward, using the native History API —
 * there are only ever two "pages" here, so a router dependency isn't needed.
 */
import { useEffect, useRef } from "react";
import { getConversation } from "../lib/history";
import { useChatStore } from "../store/chat";

function conversationIdFromPath(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
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

export function useConversationRouting(): void {
  const contextId = useChatStore((s) => s.contextId);
  const lastSynced = useRef<string | null | undefined>(undefined);

  // Restore from the URL once on mount (deep link or refresh).
  useEffect(() => {
    const id = conversationIdFromPath(window.location.pathname);
    if (id) void loadFromUrl(id);
  }, []);

  // Push the URL whenever the active conversation changes (first reply, history
  // switch, "New chat"). Skipped on the very first run so it never fights the
  // mount-restore above.
  useEffect(() => {
    if (lastSynced.current === undefined) {
      lastSynced.current = contextId;
      return;
    }
    if (contextId === lastSynced.current) return;
    lastSynced.current = contextId;
    const target = contextId ? `/c/${contextId}` : "/";
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
  }, [contextId]);

  // Browser back/forward.
  useEffect(() => {
    function onPopState() {
      const id = conversationIdFromPath(window.location.pathname);
      if (id) void loadFromUrl(id);
      else useChatStore.getState().newChat();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
