/** Files gallery page: every document, uploaded attachment, and generated image in one place. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DocumentIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { deleteAttachment, listAttachments, type AttachmentItem, type AttachmentKind } from "../lib/attachments";
import { deleteDocument } from "../lib/documents";
import { formatBytes } from "../lib/format";
import { getConversation } from "../lib/history";
import { useChatStore } from "../store/chat";

type KindFilter = "all" | AttachmentKind;
type SortKey = "date" | "name" | "size";
type ViewMode = "grid" | "list";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "document", label: "Documents" },
  { value: "attachment", label: "Uploads" },
  { value: "generated-image", label: "Generated" },
];

const KIND_LABEL: Record<AttachmentKind, string> = {
  document: "Document",
  attachment: "Uploaded",
  "generated-image": "Generated",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(item: AttachmentItem): string | null {
  if (item.kind !== "document") return null;
  if (item.status === "pending") return "Processing…";
  if (item.status === "failed") return item.error ?? "Failed to process";
  return null;
}

function isImage(item: AttachmentItem): boolean {
  return item.mimeType.startsWith("image/");
}

function sortItems(items: AttachmentItem[], sort: SortKey): AttachmentItem[] {
  const sorted = items.slice();
  if (sort === "name") sorted.sort((a, b) => a.originalName.localeCompare(b.originalName));
  else if (sort === "size") sorted.sort((a, b) => b.size - a.size);
  else sorted.sort((a, b) => b.createdAt - a.createdAt);
  return sorted;
}

interface FilesPageProps {
  navigateToChat: () => void;
}

export function FilesPage({ navigateToChat }: FilesPageProps) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listAttachments()
      .then((list) => {
        setItems(list);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byKindAndQuery = items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (needle && !item.originalName.toLowerCase().includes(needle)) return false;
      return true;
    });
    return sortItems(byKindAndQuery, sort);
  }, [items, kindFilter, query, sort]);

  function openFile(item: AttachmentItem) {
    window.open(item.url, "_blank", "noopener,noreferrer");
  }

  async function goToConversation(id: string) {
    try {
      const detail = await getConversation(id);
      useChatStore.getState().loadConversation(detail.id, detail.model, detail.turns);
      navigateToChat();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(item: AttachmentItem) {
    if (confirmingId !== item.id) {
      setConfirmingId(item.id);
      return;
    }
    setConfirmingId(null);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setActionError(null);
    try {
      if (item.kind === "document" && item.documentId) {
        await deleteDocument(item.documentId);
        useChatStore.getState().removeActiveDocument(item.documentId);
      } else {
        await deleteAttachment(item.id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      refresh();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 pt-6 pb-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium tracking-tight text-slate-900 dark:text-slate-100">Files</h1>
            <div className="flex items-center gap-2">
              <SortSelect sort={sort} onChange={setSort} />
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-white/70 px-3 py-2 ring-1 ring-slate-200/70 backdrop-blur-md focus-within:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
              <MagnifyingGlassIcon className="size-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files..."
                aria-label="Search files"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <KindFilterControl value={kindFilter} onChange={setKindFilter} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-1 pb-10">
          {loadError && <p className="px-2 py-1 text-sm text-rose-500 dark:text-rose-400">{loadError}</p>}
          {actionError && <p className="px-2 py-1 text-sm text-rose-500 dark:text-rose-400">{actionError}</p>}
          {!loading && !loadError && filtered.length === 0 && (
            <p className="px-2 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
              {items.length === 0 ? "No files yet — attach one from a chat, or upload a document." : "No matches."}
            </p>
          )}
          {!loadError &&
            filtered.length > 0 &&
            (viewMode === "grid" ? (
              <GridView
                items={filtered}
                confirmingId={confirmingId}
                onOpen={openFile}
                onDelete={(item) => void handleDelete(item)}
                onGoToConversation={(id) => void goToConversation(id)}
              />
            ) : (
              <ListView
                items={filtered}
                confirmingId={confirmingId}
                onOpen={openFile}
                onDelete={(item) => void handleDelete(item)}
                onGoToConversation={(id) => void goToConversation(id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function KindIcon({ item, className }: { item: AttachmentItem; className: string }) {
  if (item.kind === "document") {
    return item.status === "failed" ? (
      <ExclamationTriangleIcon className={className} aria-hidden="true" />
    ) : (
      <DocumentTextIcon className={className} aria-hidden="true" />
    );
  }
  if (item.mimeType.startsWith("audio/")) return <MusicalNoteIcon className={className} aria-hidden="true" />;
  return <DocumentIcon className={className} aria-hidden="true" />;
}

function usedInLabel(item: AttachmentItem): string | null {
  if (item.usedIn.length === 0) return null;
  if (item.usedIn.length === 1) return item.usedIn[0]!.title;
  return `${item.usedIn.length} chats`;
}

function ConfirmNotice({ item }: { item: AttachmentItem }) {
  return (
    <p className="px-3 pb-2 text-xs text-rose-500 dark:text-rose-400">
      {item.usedIn.length > 0
        ? `Used in ${item.usedIn.length} chat${item.usedIn.length === 1 ? "" : "s"} — tap delete again to remove.`
        : "Tap delete again to remove."}
    </p>
  );
}

function GridView({
  items,
  confirmingId,
  onOpen,
  onDelete,
  onGoToConversation,
}: {
  items: AttachmentItem[];
  confirmingId: string | null;
  onOpen: (item: AttachmentItem) => void;
  onDelete: (item: AttachmentItem) => void;
  onGoToConversation: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 px-1 pt-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <FileTile
          key={item.id}
          item={item}
          confirming={confirmingId === item.id}
          onOpen={onOpen}
          onDelete={onDelete}
          onGoToConversation={onGoToConversation}
        />
      ))}
    </div>
  );
}

function FileTile({
  item,
  confirming,
  onOpen,
  onDelete,
  onGoToConversation,
}: {
  item: AttachmentItem;
  confirming: boolean;
  onOpen: (item: AttachmentItem) => void;
  onDelete: (item: AttachmentItem) => void;
  onGoToConversation: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const label = usedInLabel(item);
  const status = statusLabel(item);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-white/70 ring-1 ring-slate-200/70 backdrop-blur-md transition hover:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.originalName}`}
        className="flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-100/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-800/60"
      >
        {isImage(item) && !broken ? (
          <img
            src={item.url}
            alt={item.originalName}
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          <KindIcon item={item} className="size-9 text-slate-400 dark:text-slate-500" />
        )}
      </button>
      {item.kind === "generated-image" && (
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-600 backdrop-blur dark:bg-slate-900/80 dark:text-slate-300">
          <SparklesIcon className="size-3" aria-hidden="true" />
          Generated
        </span>
      )}
      <button
        type="button"
        aria-label={confirming ? `Confirm delete "${item.originalName}"` : `Delete "${item.originalName}"`}
        onClick={() => onDelete(item)}
        className={`absolute top-2 right-2 flex size-7 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
          confirming
            ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
            : "bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        <TrashIcon className="size-3.5" aria-hidden="true" />
      </button>

      <div className="flex flex-col gap-0.5 p-3">
        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.originalName}</p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          {[formatBytes(item.size), formatDate(item.createdAt)].filter(Boolean).join(" • ")}
        </p>
        {status && <p className="truncate text-xs text-amber-600 dark:text-amber-400">{status}</p>}
        {label &&
          (item.usedIn.length === 1 ? (
            <button
              type="button"
              onClick={() => onGoToConversation(item.usedIn[0]!.id)}
              className="truncate text-left text-xs text-blue-500 hover:underline dark:text-blue-400"
            >
              {label}
            </button>
          ) : (
            <span
              className="truncate text-xs text-slate-400 dark:text-slate-500"
              title={item.usedIn.map((c) => c.title).join(", ")}
            >
              {label}
            </span>
          ))}
      </div>
      {confirming && <ConfirmNotice item={item} />}
    </div>
  );
}

function ListView({
  items,
  confirmingId,
  onOpen,
  onDelete,
  onGoToConversation,
}: {
  items: AttachmentItem[];
  confirmingId: string | null;
  onOpen: (item: AttachmentItem) => void;
  onDelete: (item: AttachmentItem) => void;
  onGoToConversation: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="hidden items-center gap-3 px-4 pb-1 text-xs font-medium tracking-wide text-slate-400 uppercase sm:flex dark:text-slate-500">
        <span className="w-9" />
        <span className="min-w-0 flex-1">Name</span>
        <span className="w-20 shrink-0">Type</span>
        <span className="w-16 shrink-0">Size</span>
        <span className="w-24 shrink-0">Date</span>
        <span className="w-32 shrink-0">Conversation</span>
        <span className="w-8 shrink-0" />
      </div>
      {items.map((item) => {
        const label = usedInLabel(item);
        return (
          <div key={item.id} className="flex flex-col rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <div className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100/60 dark:bg-slate-800/60">
                  {isImage(item) ? (
                    <img src={item.url} alt="" className="size-full object-cover" />
                  ) : (
                    <KindIcon item={item} className="size-4 text-slate-400 dark:text-slate-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {item.originalName}
                  {statusLabel(item) && (
                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{statusLabel(item)}</span>
                  )}
                </span>
                <span className="hidden w-20 shrink-0 text-xs text-slate-400 sm:block dark:text-slate-500">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="hidden w-16 shrink-0 text-xs text-slate-400 sm:block dark:text-slate-500">
                  {formatBytes(item.size)}
                </span>
                <span className="w-24 shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDate(item.createdAt)}</span>
                <span className="hidden w-32 shrink-0 truncate text-xs text-slate-400 md:block dark:text-slate-500" title={item.usedIn.map((c) => c.title).join(", ")}>
                  {label ?? "—"}
                </span>
              </button>
              {item.usedIn.length === 1 && (
                <button
                  type="button"
                  aria-label={`Go to "${item.usedIn[0]!.title}"`}
                  onClick={() => onGoToConversation(item.usedIn[0]!.id)}
                  className="hidden shrink-0 rounded-full px-2 py-1 text-xs text-blue-500 opacity-0 transition-opacity group-hover:opacity-100 hover:underline focus-visible:opacity-100 md:block dark:text-blue-400"
                >
                  Open chat
                </button>
              )}
              <button
                type="button"
                aria-label={confirmingId === item.id ? `Confirm delete "${item.originalName}"` : `Delete "${item.originalName}"`}
                onClick={() => onDelete(item)}
                className={`mr-1 flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                  confirmingId === item.id
                    ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <TrashIcon className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {confirmingId === item.id && <ConfirmNotice item={item} />}
          </div>
        );
      })}
    </div>
  );
}

/** Roving-tabindex radiogroup with Left/Right arrow-key navigation, per aurora-design's segmented-control recipe. */
function useRovingRadioGroup<T extends string>(options: readonly T[], value: T, onChange: (v: T) => void) {
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement>>>({});
  function move(delta: 1 | -1) {
    const i = options.indexOf(value);
    const next = options[(i + delta + options.length) % options.length];
    if (!next) return;
    onChange(next);
    buttonRefs.current[next]?.focus();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    }
  }
  return { buttonRefs, onKeyDown };
}

function KindFilterControl({ value, onChange }: { value: KindFilter; onChange: (v: KindFilter) => void }) {
  const values = KIND_FILTERS.map((o) => o.value);
  const { buttonRefs, onKeyDown } = useRovingRadioGroup(values, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label="Filter by kind"
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:ring-slate-700/60"
    >
      {KIND_FILTERS.map(({ value: v, label }) => {
        const checked = v === value;
        return (
          <button
            key={v}
            ref={(el) => {
              buttonRefs.current[v] = el ?? undefined;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              checked
                ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof Squares2X2Icon }[] = [
  { value: "grid", label: "Grid view", icon: Squares2X2Icon },
  { value: "list", label: "List view", icon: ListBulletIcon },
];

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (v: ViewMode) => void }) {
  const values = VIEW_OPTIONS.map((o) => o.value);
  const { buttonRefs, onKeyDown } = useRovingRadioGroup(values, mode, onChange);
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:ring-slate-700/60"
    >
      {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = value === mode;
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[value] = el ?? undefined;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(value)}
            className={`flex size-8 items-center justify-center rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              checked
                ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function SortSelect({ sort, onChange }: { sort: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-full bg-slate-100/80 py-1.5 pr-2 pl-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80">
      <span className="sr-only">Sort by</span>
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="appearance-none bg-transparent focus:outline-hidden"
      >
        <option value="date">Newest</option>
        <option value="name">Name</option>
        <option value="size">Size</option>
      </select>
    </label>
  );
}
