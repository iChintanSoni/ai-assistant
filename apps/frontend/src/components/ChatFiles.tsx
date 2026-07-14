/** Chip strip above the Composer: documents active in this conversation, plus files staged to send next. */
import { useEffect, useRef, useState } from "react";
import {
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MusicalNoteIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getDocument, type DocumentSummary } from "../lib/documents";
import { useChatStore } from "../store/chat";
import type { PendingAttachment } from "../hooks/useAttachments";

const POLL_MS = 1500;

/** A 404 means the document was deleted from the library since this chat last used it. */
type DocEntry = DocumentSummary | "removed";

interface ChatFilesProps {
  attachments: PendingAttachment[];
  removeAttachment: (index: number) => void;
}

function Chip({
  icon,
  image,
  name,
  detail,
  detailClassName,
  title,
  onRemove,
}: {
  icon?: React.ReactNode;
  image?: string;
  name: string;
  detail?: string;
  detailClassName?: string;
  title?: string;
  onRemove: () => void;
}) {
  return (
    <span
      title={title}
      className="flex items-center gap-1.5 rounded-full bg-slate-100/80 py-1 pr-1.5 pl-2.5 text-xs text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/60"
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="size-4 shrink-0 rounded-full object-cover"
        />
      ) : (
        icon
      )}
      <span className="max-w-40 truncate">{name}</span>
      {detail && (
        <span
          className={detailClassName ?? "text-slate-400 dark:text-slate-500"}
        >
          {detail}
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <XMarkIcon className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

export function ChatFiles({ attachments, removeAttachment }: ChatFilesProps) {
  const activeIds = useChatStore((s) => s.activeDocumentIds);
  const removeActiveDocument = useChatStore((s) => s.removeActiveDocument);
  const [docs, setDocs] = useState<Record<string, DocEntry>>({});
  const docsRef = useRef(docs);
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;

    async function refresh() {
      const results = await Promise.all(
        activeIds.map(async (id) => {
          try {
            return await getDocument(id);
          } catch {
            return "removed" as const;
          }
        }),
      );
      if (cancelled) return;
      setDocs((prev) => {
        const next = { ...prev };
        results.forEach((doc, i) => {
          next[activeIds[i]!] = doc;
        });
        return next;
      });
    }

    void refresh();
    const anyPending = activeIds.some((id) => {
      const entry = docsRef.current[id];
      return !entry || (entry !== "removed" && entry.status === "pending");
    });
    if (!anyPending) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Re-run when the set of active ids changes, or a poll tick might flip a status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(",")]);

  if (activeIds.length === 0 && attachments.length === 0) return null;

  return (
    <div className="mx-auto mb-2 flex w-full max-w-2xl flex-wrap gap-1.5 px-3">
      {activeIds.map((id) => {
        const entry = docs[id];
        if (entry === "removed") {
          return (
            <Chip
              key={id}
              icon={
                <ExclamationTriangleIcon
                  className="size-3.5 shrink-0 text-rose-500 dark:text-rose-400"
                  aria-hidden="true"
                />
              }
              name="Removed from library"
              onRemove={() => removeActiveDocument(id)}
            />
          );
        }
        const status = entry?.status ?? "pending";
        return (
          <Chip
            key={id}
            icon={
              status === "failed" ? (
                <ExclamationTriangleIcon
                  className="size-3.5 shrink-0 text-rose-500 dark:text-rose-400"
                  aria-hidden="true"
                />
              ) : (
                <DocumentTextIcon
                  className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
              )
            }
            name={entry?.originalName ?? "Loading…"}
            detail={
              status === "pending"
                ? "processing…"
                : status === "failed"
                  ? "failed"
                  : undefined
            }
            detailClassName={
              status === "failed"
                ? "text-rose-500 dark:text-rose-400"
                : "text-slate-400 italic dark:text-slate-500"
            }
            title={
              status === "failed"
                ? (entry?.error ?? "Failed to process")
                : undefined
            }
            onRemove={() => removeActiveDocument(id)}
          />
        );
      })}
      {attachments.map((a, i) => (
        <Chip
          key={`${a.file.name}-${i}`}
          image={a.previewUrl}
          icon={
            a.previewUrl ? undefined : (
              <MusicalNoteIcon
                className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
            )
          }
          name={a.file.name}
          onRemove={() => removeAttachment(i)}
        />
      ))}
    </div>
  );
}
