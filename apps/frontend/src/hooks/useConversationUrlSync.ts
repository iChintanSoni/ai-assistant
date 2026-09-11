/**
 * Keeps the URL and the open conversation in agreement at the chat hub.
 *
 * Two different things leave `/` showing while the store holds a contextId, and they
 * need opposite responses:
 *
 *  - A navigation landed on the hub with a conversation still open (Back, or New
 *    chat) — the user is leaving it, so clear it.
 *  - The agent assigned a contextId to this brand-new chat mid-stream — point the
 *    URL at it, with `replace` so Back returns to wherever the user actually came
 *    from rather than the hub the conversation grew out of.
 *
 * Two discriminators, because state alone can't tell them apart:
 *
 *  - `location.key` changes on every navigation (Back included) and never when only
 *    the store changes, so it identifies the first case.
 *  - `activeTaskId` identifies the second: it is set together with contextId by
 *    `setActiveTask` for a live task, and nulled by `loadConversation`/`newChat`. A
 *    conversation loaded from history therefore never looks like a live one. This
 *    matters because the /c/:id loader commits to the store *before* the location
 *    catches up, so the hub briefly renders holding a contextId it isn't showing —
 *    and demoting that in-flight push to a replace would cost the user their Back
 *    entry. (`useNavigation()` can't guard that window: it reads a context React may
 *    not have committed yet when zustand's own update triggers this effect.)
 *
 * Must be called from a component that outlives route changes — the route elements
 * don't. `/` and `/c/:id` are separate route entries, so a ref living in the chat
 * view would reset exactly when Back needs it. It is also deliberately one effect:
 * split in two, the URL sync would run against a not-yet-cleared contextId and
 * navigate straight back into the conversation the user just left.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useChatStore } from "../store/chat";

export function useConversationUrlSync(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const contextId = useChatStore((s) => s.contextId);
  const activeTaskId = useChatStore((s) => s.activeTaskId);
  const newChat = useChatStore((s) => s.newChat);
  const lastKey = useRef(location.key);

  useEffect(() => {
    const navigated = location.key !== lastKey.current;
    lastKey.current = location.key;
    // Only the hub can disagree: on /c/:id the loader already reconciled them, and
    // the other views have no opinion about which conversation is open.
    if (location.pathname !== "/" || !contextId) return;
    // A turn still streaming has no saved transcript yet — persistConversation runs
    // only when it settles, and reads contextId to know where to put it. Clearing
    // here would destroy an answer mid-write, so send the conversation back to its
    // own URL instead. It also covers the case where the agent assigned the
    // contextId while the user was reading Files, so the URL was never written.
    // Abandoning a live turn stays possible — that's what New chat is for.
    if (activeTaskId) void navigate(`/c/${encodeURIComponent(contextId)}`, { replace: true });
    else if (navigated) newChat();
  }, [location.key, location.pathname, contextId, activeTaskId, newChat, navigate]);
}
