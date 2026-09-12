/** The prompt pill: modality-gated attach, multiline input, model selector, record/stop. */
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpIcon, MicrophoneIcon, PlusIcon, StopIcon } from "@heroicons/react/24/outline";
import { ModelSelector } from "./ModelSelector";
import { UsageGauge } from "./UsageGauge";
import { ChatFiles } from "./ChatFiles";
import { useChat } from "../hooks/useChat";
import { useChatStore } from "../store/chat";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { PendingAttachment } from "../hooks/useAttachments";
import { acceptFor } from "../lib/models";
import { DOCUMENT_ACCEPT } from "../lib/documents";
import { isCoarsePointer } from "../lib/pointer";

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
  const activeDocumentIds = useChatStore((s) => s.activeDocumentIds);
  const model = models.find((m) => m.name === selectedName);
  const hasAttachments = attachments.length > 0 || activeDocumentIds.length > 0;

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Mirrors submit()'s guard — an attachment with no text is a valid message.
  const canSend = text.trim().length > 0 || attachments.length > 0;
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput((transcript) =>
    setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  );

  useLayoutEffect(() => {
    const element = textArea.current;
    if (!element) return;
    function resize() {
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }
    resize();
    // The textarea's vertical padding is breakpoint-dependent (py-2.5 -> md:py-0)
    // and scrollHeight includes it under border-box, so a cached height goes stale
    // when the viewport crosses md: — rotating a phone would otherwise leave the
    // draft clipped to a few pixels until the next keystroke.
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [text]);

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
      <div
        data-testid="composer-surface"
        data-expanded={hasAttachments}
        className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 bg-white/70 ring-1 ring-slate-200/70 backdrop-blur-md transition focus-within:ring-blue-300/70 md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] dark:bg-slate-900/70 dark:ring-slate-700/60 ${
          hasAttachments
            ? "grid-rows-[auto_auto_auto] gap-y-3 rounded-3xl px-4 py-3 md:min-h-64 md:grid-rows-[auto_minmax(1.5rem,1fr)_auto] md:px-5 md:py-4"
            : "grid-rows-[auto_auto] gap-y-2 rounded-3xl px-4 py-3 md:grid-rows-1 md:gap-y-0 md:rounded-full md:px-3 md:py-2.5"
        }`}
      >
        {hasAttachments && (
          <div className="col-span-full row-start-1 self-start">
            <ChatFiles attachments={attachments} removeAttachment={removeAttachment} />
          </div>
        )}

        <button
          type="button"
          aria-label="Add attachment"
          onClick={() => fileInput.current?.click()}
          className={`col-start-1 flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 pointer-coarse:size-11 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
            hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
          }`}
        >
          <PlusIcon className="size-6" aria-hidden="true" />
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

        <textarea
          ref={textArea}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Only a keyboard with a real Shift+Enter gets Enter-to-send; on a soft
            // keyboard Enter has to stay a newline, and Send is the button.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isCoarsePointer()) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask anything..."
          aria-label="Ask anything"
          className={`max-h-40 min-h-6 min-w-0 resize-none overflow-y-auto bg-transparent text-base leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500 ${
            hasAttachments
              ? "col-span-full row-start-2 self-stretch px-2 py-2.5 md:py-0"
              : "col-span-full row-start-1 px-2 py-2.5 md:col-span-1 md:col-start-2 md:px-0 md:py-0"
          }`}
        />

        <div
          className={`col-start-2 hidden justify-self-end sm:block md:col-start-3 md:justify-self-auto ${
            hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
          }`}
        >
          <UsageGauge />
        </div>
        <div
          className={`col-start-3 md:col-start-4 ${
            hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
          }`}
        >
          <ModelSelector />
        </div>

        {/* The mic is always present — voice input appends to an existing draft, so
            swapping it out for Send would make dictation reachable only from an
            empty composer. Send appears alongside it, because a soft keyboard has
            no Shift+Enter: Enter has to insert a newline there, which leaves a
            button as the only way to send. */}
        {isStreaming ? (
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop"
            className={`col-start-5 flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 pointer-coarse:size-11 md:col-start-6 dark:bg-slate-700 dark:hover:bg-slate-600 ${
              hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
            }`}
          >
            <StopIcon className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={
                voice.state === "recording"
                  ? "Stop recording"
                  : voice.state === "transcribing"
                    ? "Transcribing…"
                    : "Record voice message"
              }
              onClick={voice.toggle}
              disabled={voice.state === "transcribing" || isSending}
              className={`col-start-4 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-40 pointer-coarse:size-11 md:col-start-5 ${
                hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
              } ${
                voice.state === "recording"
                  ? "bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              }`}
            >
              <MicrophoneIcon
                className={`size-5 ${voice.state !== "idle" ? "animate-pulse" : ""}`}
                aria-hidden="true"
              />
            </button>
            {canSend && (
              <button
                type="button"
                aria-label="Send"
                onClick={() => void submit()}
                disabled={isSending}
                className={`col-start-5 flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-40 pointer-coarse:size-11 md:col-start-6 dark:bg-slate-700 dark:hover:bg-slate-600 ${
                  hasAttachments ? "row-start-3" : "row-start-2 md:row-start-1"
                }`}
              >
                <ArrowUpIcon className="size-5" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      {(sendError || voice.error || notice) && (
        <p className="mx-auto mt-3 max-w-2xl px-3 text-center text-sm text-rose-500 dark:text-rose-400">
          {sendError || voice.error || notice}
        </p>
      )}
    </div>
  );
}
