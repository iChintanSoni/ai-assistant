/** Floating flyout listing past conversations — opened from the rail's History button. */
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationSummary,
} from "../lib/history";
import { useChatStore } from "../store/chat";

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function bucketFor(updatedAt: number, now: number): (typeof GROUP_ORDER)[number] {
  const diffDays = Math.round((startOfDay(now) - startOfDay(updatedAt)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}

function formatTime(updatedAt: number, now: number): string {
  const sameDay = startOfDay(updatedAt) === startOfDay(now);
  return sameDay
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupConversations(items: ConversationSummary[]): [string, ConversationSummary[]][] {
  const now = Date.now();
  const buckets = new Map<string, ConversationSummary[]>();
  for (const item of items) {
    const key = bucketFor(item.updatedAt, now);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => [key, buckets.get(key)!]);
}

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function HistoryPanel({ open, onClose, triggerRef }: HistoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Fetch on open and whenever the (debounced) search query changes.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(
      () => {
        listConversations(query)
          .then((list) => {
            if (active) setConversations(list);
          })
          .catch((err) => {
            if (active) setLoadError(err instanceof Error ? err.message : String(err));
          });
      },
      query ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  // Reset transient state and focus the search box each time the panel opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setConfirmingId(null);
      setLoadError(null);
      searchRef.current?.focus();
    }
  }, [open]);

  // Escape + outside click both dismiss; clicking the trigger button is left to its own onClick.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerRef]);

  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const now = Date.now();

  if (!open) return null;

  // Every dismissal path returns focus to the rail button that opened this panel.
  function close() {
    onClose();
    triggerRef.current?.focus();
  }

  const openConversation = async (id: string) => {
    try {
      const detail = await getConversation(id);
      useChatStore.getState().loadConversation(detail.id, detail.model, detail.turns);
      close();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setConfirmingId(null);
    try {
      await deleteConversation(id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Conversation history"
      className="fixed top-6 left-20 z-30 flex max-h-[70vh] w-80 flex-col gap-2 rounded-3xl bg-white/80 p-3 ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/80 dark:ring-slate-700/60"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">History</span>
        <button
          type="button"
          aria-label="Close history"
          onClick={close}
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 ring-1 ring-slate-200/70 focus-within:ring-blue-300/70 dark:bg-slate-950/50 dark:ring-slate-700/60">
        <MagnifyingGlassIcon className="size-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations..."
          aria-label="Search conversations"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {loadError && <p className="px-2 py-1 text-xs text-rose-500 dark:text-rose-400">{loadError}</p>}
        {!loadError && conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            {query ? "No matches." : "No conversations yet."}
          </p>
        )}
        {groups.map(([label, items]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <p className="px-2 pt-3 pb-1 text-xs font-medium tracking-wide text-slate-400 uppercase first:pt-1 dark:text-slate-500">
              {label}
            </p>
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-1 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <button
                  type="button"
                  onClick={() => void openConversation(item.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {formatTime(item.updatedAt, now)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={confirmingId === item.id ? `Confirm delete "${item.title}"` : `Delete "${item.title}"`}
                  onClick={() => void handleDelete(item.id)}
                  className={`mr-1 flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                    confirmingId === item.id
                      ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                      : "text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <TrashIcon className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
