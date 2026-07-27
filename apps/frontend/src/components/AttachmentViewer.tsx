import { useEffect, useEffectEvent, useRef } from "react";
import { ArrowLeftIcon, DocumentIcon, MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { createPortal } from "react-dom";
import type { ViewableAttachment } from "../lib/attachmentPreview";

function ViewerIcon({ mimeType }: { mimeType: string }) {
  const className = "size-5 shrink-0";
  if (mimeType.startsWith("image/")) return <PhotoIcon className={className} aria-hidden="true" />;
  if (mimeType.startsWith("audio/")) return <MusicalNoteIcon className={className} aria-hidden="true" />;
  if (mimeType.startsWith("video/")) return <VideoCameraIcon className={className} aria-hidden="true" />;
  return <DocumentIcon className={className} aria-hidden="true" />;
}

function ViewerContent({ attachment }: { attachment: ViewableAttachment }) {
  const { name, url, mimeType } = attachment;
  if (mimeType.startsWith("image/")) {
    return <img src={url} alt={name} className="max-h-full max-w-full object-contain" />;
  }
  if (mimeType.startsWith("audio/")) {
    return <audio src={url} controls autoPlay className="w-full max-w-2xl" aria-label={name} />;
  }
  if (mimeType.startsWith("video/")) {
    return <video src={url} controls autoPlay className="max-h-full max-w-full" aria-label={name} />;
  }
  return (
    <iframe
      src={url}
      title={name}
      className="size-full rounded-2xl bg-white"
    />
  );
}

export function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: ViewableAttachment;
  onClose: () => void;
}) {
  const backButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.name}`}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950/95 text-slate-100 backdrop-blur-xl sm:inset-2 sm:rounded-3xl"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 px-4 sm:px-6">
        <button
          ref={backButton}
          type="button"
          aria-label="Close attachment preview"
          onClick={onClose}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
        </button>
        <ViewerIcon mimeType={attachment.mimeType} />
        <span className="min-w-0 truncate text-base font-medium">{attachment.name}</span>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <ViewerContent attachment={attachment} />
      </div>
    </div>,
    document.body,
  );
}
