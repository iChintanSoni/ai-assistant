/** The prompt pill: modality-gated attach, input, model selector, send/stop. */
import { useRef, useState } from "react";
import { ArrowUpIcon, PaperClipIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ModelSelector } from "./ModelSelector";
import { useChat } from "../hooks/useChat";
import { useChatStore } from "../store/chat";
import type { PendingAttachment } from "../hooks/useAttachments";
import { acceptFor } from "../lib/models";
import { DOCUMENT_ACCEPT } from "../lib/documents";

interface ComposerProps {
  attachments: PendingAttachment[];
  notice: string | null;
  addFiles: (files: File[]) => void;
  removeAttachment: (index: number) => void;
  clear: () => void;
}

export function Composer({ attachments, notice, addFiles, removeAttachment, clear }: ComposerProps) {
  const { send, stop } = useChat();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedName = useChatStore((s) => s.selectedModel);
  const models = useChatStore((s) => s.models);
  const model = models.find((m) => m.name === selectedName);

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit() {
    if (isStreaming || isSending) return;
    if (!text.trim() && attachments.length === 0) return;
    const t = text;
    const f = attachments.map((a) => a.file);
    setSendError(null);
    setIsSending(true);
    try {
      // Uploads happen inside send(); only clear the draft once it's actually sent,
      // so a failed upload (e.g. file-storage unreachable) doesn't lose the user's input.
      await send(t, f);
      clear();
      setText("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Couldn't send that. Try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-3">
          {attachments.map((a, i) => (
            <span
              key={`${a.file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-full bg-slate-100/80 py-1 pr-1.5 pl-1.5 text-xs text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/60"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="size-6 rounded-full object-cover" />
              ) : (
                <span className="w-1.5" />
              )}
              <span className="max-w-[12rem] truncate">{a.file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${a.file.name}`}
                onClick={() => removeAttachment(i)}
                className="flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <XMarkIcon className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-2.5 ring-1 ring-slate-200/70 backdrop-blur-md transition focus-within:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
        <button
          type="button"
          aria-label="Add attachment"
          onClick={() => fileInput.current?.click()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <PaperClipIcon className="size-5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={[acceptFor(model), DOCUMENT_ACCEPT].filter(Boolean).join(",")}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          className="hidden"
        />

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask anything..."
          aria-label="Ask anything"
          className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <ModelSelector />

        {isStreaming ? (
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <StopIcon className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            aria-label="Send"
            disabled={isSending || (!text.trim() && attachments.length === 0)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-white transition hover:opacity-90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-40"
          >
            <ArrowUpIcon className="size-5" />
          </button>
        )}
      </div>

      {(sendError || notice) && (
        <p className="mx-auto mt-3 max-w-2xl px-3 text-center text-sm text-rose-500 dark:text-rose-400">
          {sendError || notice}
        </p>
      )}
    </div>
  );
}
