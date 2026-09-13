/**
 * The route table.
 *
 *   /               the chat hub
 *   /c/:id          one conversation — deep-linkable, refresh-safe, back/forward-safe
 *   /files          the Files gallery
 *   /settings       settings
 *   /share-target   landing page for a file shared in from another app (sw.ts)
 *
 * Exported as a plain array rather than a built router so tests can mount it in a
 * fresh memory router per test; a module-scope browser router would be shared (and
 * pinned to whatever URL was current when this module first loaded).
 */
import { Navigate, redirect, type LoaderFunctionArgs, type RouteObject } from "react-router";
import { getConversation } from "./lib/history";
import { ChatRoute } from "./routes/ChatRoute";
import { FilesRoute } from "./routes/FilesRoute";
import { RootFallback, RootLayout } from "./routes/RootLayout";
import { SettingsRoute } from "./routes/SettingsRoute";
import { ShareTargetRoute } from "./routes/ShareTargetRoute";
import { useChatStore } from "./store/chat";

/**
 * Restores the conversation named in the URL — a deep link, a refresh, or
 * back/forward.
 *
 * The early return is load-bearing, not an optimisation. A brand-new chat rewrites
 * its own URL to `/c/:id` the moment the agent assigns a contextId, which happens
 * *while the turn is still streaming* — fetching here would overwrite those live
 * turns with the not-yet-saved transcript and blank the screen mid-answer. It also
 * covers the History flyout and the Files page, which load a conversation
 * themselves (so a failure can be reported in place) and then navigate.
 */
export async function conversationLoader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? "";
  const store = useChatStore.getState();
  if (store.contextId === id) return null;
  try {
    const detail = await getConversation(id);
    store.loadConversation(detail.id, detail.model, detail.turns);
  } catch (err) {
    // A URL naming a deleted or unknown conversation shouldn't strand the user on a
    // broken page: log it and fall back to a fresh chat at the hub.
    console.error("Failed to restore conversation from URL:", err);
    store.newChat();
    throw redirect("/");
  }
  return null;
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    // Shown while an initial loader runs — i.e. a refreshed or deep-linked /c/:id,
    // which can't render until its transcript arrives.
    HydrateFallback: RootFallback,
    children: [
      { index: true, element: <ChatRoute /> },
      { path: "c/:id", element: <ChatRoute />, loader: conversationLoader },
      { path: "files", element: <FilesRoute /> },
      { path: "settings", element: <SettingsRoute /> },
      { path: "share-target", element: <ShareTargetRoute /> },
      // An unknown path used to fall through to the chat view; keep that rather than
      // dead-ending on the router's unstyled default error page.
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
