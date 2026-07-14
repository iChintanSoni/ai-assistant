/** Scrollable transcript: user pills + agent turns (thinking, tools, answer). */
import { useEffect, useRef, useState } from "react";
import {
  ArchiveBoxIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  LightBulbIcon,
  PhotoIcon,
  ShieldExclamationIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useChatStore } from "../store/chat";
import type { LegacyUIAttachment, UIAttachment, UICompaction, UIToolCall, UITurn } from "../store/chat";
import { useChat } from "../hooks/useChat";
import { currentTimeMs, formatFullDateTime, formatMessageTime } from "../lib/format";
import type { ApprovalRequest, Decision } from "../lib/envelope";

const markdownComponents: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-indigo-600 dark:text-blue-400 dark:decoration-blue-500 dark:hover:text-indigo-400"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mt-2 text-xl font-medium tracking-tight text-slate-900 dark:text-slate-100">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-2 text-lg font-medium tracking-tight text-slate-900 dark:text-slate-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">{children}</h3>
  ),
  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-slate-900 dark:text-slate-100">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-slate-200/70 dark:border-slate-700/60" />,
  img: ({ alt, ...props }) => (
    // Defensive: the model shouldn't restate generated-image URLs (the tool card already
    // renders them), but if it ever does, keep the transcript from blowing out.
    <img
      {...props}
      alt={alt ?? ""}
      className="max-h-105 w-full rounded-2xl bg-slate-100/60 object-contain ring-1 ring-slate-200/60 dark:bg-slate-800/60 dark:ring-slate-700/60"
    />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (!isBlock) {
      return (
        <code
          className="rounded-md bg-slate-100/80 px-1.5 py-0.5 text-[0.85em] text-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-2xl bg-slate-50/70 p-3 text-sm text-slate-700 ring-1 ring-slate-200/60 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-700/50">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-700/50">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50/70 dark:bg-slate-900/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-slate-100 px-3 py-2 text-slate-700 dark:border-slate-800 dark:text-slate-300">
      {children}
    </td>
  ),
};

function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-slate-800 [&>*:first-child]:mt-0 dark:text-slate-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function fmt(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-slate-400 dark:bg-slate-500"
    />
  );
}

function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!streaming) setOpen(false);
  }, [streaming]);

  return (
    <div className="rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-200/60 dark:bg-slate-900/60 dark:ring-slate-700/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <LightBulbIcon className="size-3.5" />
        <span>Thinking</span>
        <ChevronRightIcon className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 text-sm text-slate-500 **:text-slate-500 dark:text-slate-400 dark:**:text-slate-400">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}

/** generate_image / view_document_page return `{"url": "...", ...}` as a JSON string; anything else falls back to raw output. */
function parseImageResult(output: unknown): { url: string } | null {
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output) as { url?: unknown };
    return typeof parsed.url === "string" ? { url: parsed.url } : null;
  } catch {
    return null;
  }
}

interface DocSearchHit {
  documentId: string;
  documentName: string;
  page: string;
  text: string;
}

/** search_documents returns a JSON array of excerpts; anything else falls back to raw output. */
function parseSearchResults(output: unknown): DocSearchHit[] | null {
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (h): h is DocSearchHit =>
        !!h && typeof h === "object" && typeof (h as DocSearchHit).documentName === "string" && typeof (h as DocSearchHit).text === "string",
    );
  } catch {
    return null;
  }
}

function extractPrompt(args: unknown): string | undefined {
  const prompt = args && typeof args === "object" ? (args as { prompt?: unknown }).prompt : undefined;
  return typeof prompt === "string" && prompt ? prompt : undefined;
}

function GeneratedImage({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  return (
    <>
      <img
        src={url}
        alt={alt}
        className="max-h-105 w-full rounded-2xl bg-slate-100/60 object-contain ring-1 ring-slate-200/60 dark:bg-slate-800/60 dark:ring-slate-700/60"
      />
      {caption && <p className="px-1 text-xs text-slate-400 italic dark:text-slate-500">{caption}</p>}
    </>
  );
}

function SourceCard({ hit }: { hit: DocSearchHit }) {
  const isFigure = hit.text.startsWith("[Figure]");
  const excerpt = isFigure ? hit.text.slice("[Figure]".length).trim() : hit.text;
  return (
    <div className="rounded-xl bg-white/70 p-2.5 ring-1 ring-slate-200/60 dark:bg-slate-950/50 dark:ring-slate-700/50">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        {isFigure ? <PhotoIcon className="size-3.5 shrink-0" /> : <DocumentTextIcon className="size-3.5 shrink-0" />}
        <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-300">{hit.documentName}</span>
        <span className="shrink-0">p.{hit.page}</span>
      </div>
      <p className="mt-1 line-clamp-4 text-slate-600 dark:text-slate-400">{excerpt}</p>
    </div>
  );
}

function ToolRow({ tool }: { tool: UIToolCall }) {
  const isImageGen = tool.name === "generate_image";
  const isViewPage = tool.name === "view_document_page";
  const isSearchDocs = tool.name === "search_documents";
  const isSummarize = tool.name === "summarize_document";
  const [open, setOpen] = useState(isViewPage || isSearchDocs || isSummarize);
  const running = tool.status === "started";
  const image = tool.status === "completed" && isViewPage ? parseImageResult(tool.output) : null;
  const searchHits = tool.status === "completed" && isSearchDocs ? parseSearchResults(tool.output) : null;
  const Icon = isImageGen || isViewPage ? PhotoIcon : isSearchDocs ? WrenchScrewdriverIcon : DocumentTextIcon;

  return (
    <div className="rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-200/60 dark:bg-slate-900/60 dark:ring-slate-700/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        <Icon className="size-4 text-slate-400 dark:text-slate-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{tool.name}</span>
        <span className={`text-xs ${running ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>
          {running ? "running…" : "done"}
        </span>
        <ChevronRightIcon
          className={`ml-auto size-4 text-slate-400 transition-transform dark:text-slate-500 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          {tool.args !== undefined && (
            <div>
              <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">Input</p>
              <pre className="overflow-x-auto rounded-lg bg-white/70 p-2 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">
                {fmt(tool.args)}
              </pre>
            </div>
          )}
          {(isImageGen || isViewPage) && running && (
            <div
              aria-hidden="true"
              className="flex h-48 w-full animate-pulse items-center justify-center rounded-2xl bg-slate-100/80 ring-1 ring-slate-200/60 dark:bg-slate-800/80 dark:ring-slate-700/50"
            >
              <PhotoIcon className="size-8 text-slate-300 dark:text-slate-600" />
            </div>
          )}
          {isViewPage && image && <GeneratedImage url={image.url} alt={extractPrompt(tool.args) ?? "Document page"} />}
          {isSearchDocs && searchHits && searchHits.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {searchHits.map((hit, i) => (
                <SourceCard key={`${hit.documentId}-${i}`} hit={hit} />
              ))}
            </div>
          )}
          {isSummarize && tool.status === "completed" && typeof tool.output === "string" && (
            <div className="rounded-xl bg-white/70 p-2.5 text-slate-700 ring-1 ring-slate-200/60 dark:bg-slate-950/50 dark:text-slate-300 dark:ring-slate-700/50">
              <Markdown text={tool.output} />
            </div>
          )}
          {tool.output !== undefined && (
            <div>
              <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">Output</p>
              <pre className="overflow-x-auto rounded-lg bg-white/70 p-2 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">
                {fmt(tool.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubagentRow({ sa }: { sa: UIToolCall }) {
  const [open, setOpen] = useState(false);
  const running = sa.status === "started";
  return (
    <div className="rounded-2xl bg-indigo-50/60 p-3 ring-1 ring-indigo-200/60 dark:bg-indigo-500/10 dark:ring-indigo-400/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        <UserGroupIcon className="size-4 text-indigo-400 dark:text-indigo-300" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Subagent: {sa.name}</span>
        <span className={`text-xs ${running ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>
          {running ? "working…" : "done"}
        </span>
        <ChevronRightIcon
          className={`ml-auto size-4 text-slate-400 transition-transform dark:text-slate-500 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          {sa.args !== undefined && (
            <pre className="overflow-x-auto rounded-lg bg-white/70 p-2 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">
              {typeof sa.args === "string" ? sa.args : fmt(sa.args)}
            </pre>
          )}
          {sa.output !== undefined && (
            <pre className="overflow-x-auto rounded-lg bg-white/70 p-2 text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">
              {fmt(sa.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Shown once when the summarization middleware compacts older history mid-turn to fit the model's context window. */
function CompactionRow({ compaction }: { compaction: UICompaction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-200/60 dark:bg-slate-900/60 dark:ring-slate-700/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        <ArchiveBoxIcon className="size-4 text-slate-400 dark:text-slate-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Older messages compacted</span>
        <ChevronRightIcon
          className={`ml-auto size-4 text-slate-400 transition-transform dark:text-slate-500 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 text-sm text-slate-500 **:text-slate-500 dark:text-slate-400 dark:**:text-slate-400">
          <Markdown text={compaction.summary} />
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ requests }: { requests: ApprovalRequest[] }) {
  const { respond } = useChat();
  const [decided, setDecided] = useState(false);

  const decide = (approve: boolean) => {
    setDecided(true);
    const decisions: Decision[] = requests.map(() =>
      approve ? { type: "approve" } : { type: "reject", message: "The user declined this action." },
    );
    void respond(decisions);
  };

  return (
    <div className="rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200/70 dark:bg-amber-500/10 dark:ring-amber-400/30">
      <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
        <ShieldExclamationIcon className="size-4" />
        <span>Approval required</span>
      </div>
      {requests.map((r, i) => {
        const code = typeof (r.args as { code?: unknown })?.code === "string"
          ? (r.args as { code: string }).code
          : null;
        return (
          <div key={`${r.name}-${i}`} className="mt-2">
            {r.description && <p className="text-sm text-slate-600 dark:text-slate-400">{r.description}</p>}
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{r.name}</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-white/70 p-2 text-xs text-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
              {code ?? fmt(r.args ?? {})}
            </pre>
          </div>
        );
      })}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={decided}
          onClick={() => decide(true)}
          className="rounded-full bg-linear-to-br from-blue-500 to-indigo-500 px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={decided}
          onClick={() => decide(false)}
          className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

interface RenderableAttachment {
  name: string;
  url?: string;
  isImage: boolean;
}

/**
 * Legacy persisted conversations stored attachments as plain filename strings, or (pre-fix)
 * only ever captured a URL for image attachments via `previewUrl` — non-image legacy
 * attachments have no recoverable URL and render as inert text.
 */
function normalizeAttachment(a: UIAttachment | LegacyUIAttachment | string): RenderableAttachment {
  if (typeof a === "string") return { name: a, isImage: false };
  if ("mimeType" in a) return { name: a.name, url: a.url, isImage: a.mimeType.startsWith("image/") };
  return { name: a.name, url: a.previewUrl, isImage: Boolean(a.previewUrl) };
}

/** Falls back to a muted "file removed" chip if the underlying file-storage object is gone. */
function AttachmentImage({ name, url }: { name: string; url: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <AttachmentChip name={`${name} (file removed)`} />;
  return (
    <img
      src={url}
      alt={name}
      onError={() => setErrored(true)}
      className="size-14 rounded-xl object-cover ring-1 ring-slate-200/60 dark:ring-slate-700/60"
    />
  );
}

function AttachmentChip({ name, href }: { name: string; href?: string }) {
  const className =
    "rounded-full bg-white/70 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-950/50 dark:text-slate-400 dark:ring-slate-700/60";
  if (!href) return <span className={className}>{name}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:text-slate-700 dark:hover:text-slate-200`}
    >
      {name}
    </a>
  );
}

function CopyButton({ text, label = "response" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className="flex w-fit items-center gap-1 rounded text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:text-slate-200"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <ClipboardDocumentIcon className="size-3.5" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/** Short clock time inline, full weekday/date/time via the native title tooltip on hover. */
function Timestamp({ ts }: { ts?: number }) {
  if (!ts) return null;
  return (
    <span className="text-xs text-slate-400 dark:text-slate-500" title={formatFullDateTime(ts)}>
      {formatMessageTime(ts, currentTimeMs())}
    </span>
  );
}

/** Always-visible row of timestamp + copy button under a message. */
function MessageFooter({
  ts,
  copyText,
  copyLabel,
  align = "start",
}: {
  ts?: number;
  copyText?: string;
  copyLabel?: string;
  align?: "start" | "end";
}) {
  if (!ts && !copyText) return null;
  return (
    <div className={`flex items-center gap-2 px-1 ${align === "end" ? "justify-end" : "justify-start"}`}>
      <Timestamp ts={ts} />
      {copyText && <CopyButton text={copyText} label={copyLabel} />}
    </div>
  );
}

function UserTurn({ turn }: { turn: UITurn }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-3xl bg-slate-100/80 px-4 py-2.5 text-slate-800 dark:bg-slate-800/80 dark:text-slate-100">
        {turn.text && <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>}
        {turn.attachments && turn.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.attachments.map(normalizeAttachment).map((a, i) =>
              a.isImage && a.url ? (
                <AttachmentImage key={`${a.name}-${i}`} name={a.name} url={a.url} />
              ) : (
                <AttachmentChip key={`${a.name}-${i}`} name={a.name} href={a.url} />
              ),
            )}
          </div>
        )}
      </div>
      <MessageFooter ts={turn.timestamp} copyText={turn.text || undefined} copyLabel="message" align="end" />
    </div>
  );
}

function AgentTurn({ turn }: { turn: UITurn }) {
  const idle = turn.status === "streaming" && !turn.text && !turn.reasoning && turn.tools.length === 0;
  const canCopy = turn.status === "complete" || turn.status === "failed" || turn.status === "canceled";
  const generatedImages = turn.tools
    .filter((t) => t.name === "generate_image" && t.status === "completed")
    .map((t) => ({ id: t.id, image: parseImageResult(t.output), prompt: extractPrompt(t.args) }))
    .filter((x): x is { id: string; image: { url: string }; prompt: string | undefined } => x.image !== null);
  return (
    <div className="flex flex-col gap-3">
      {turn.reasoning && <ThinkingBlock text={turn.reasoning} streaming={turn.status === "streaming"} />}
      {turn.compactions && turn.compactions.length > 0 && (
        <div className="flex flex-col gap-2">
          {turn.compactions.map((c) => (
            <CompactionRow key={c.id} compaction={c} />
          ))}
        </div>
      )}
      {turn.subagents && turn.subagents.length > 0 && (
        <div className="flex flex-col gap-2">
          {turn.subagents.map((sa) => (
            <SubagentRow key={sa.id} sa={sa} />
          ))}
        </div>
      )}
      {turn.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          {turn.tools.map((tc) => (
            <ToolRow key={tc.id} tool={tc} />
          ))}
        </div>
      )}
      {turn.text && (
        <div className="text-slate-800 dark:text-slate-200">
          <Markdown text={turn.text} />
          {turn.status === "streaming" && <Caret />}
        </div>
      )}
      {generatedImages.length > 0 && (
        <div className="flex flex-col gap-2">
          {generatedImages.map(({ id, image, prompt }) => (
            <GeneratedImage key={id} url={image.url} alt={prompt ?? "Generated image"} caption={prompt} />
          ))}
        </div>
      )}
      {idle && (
        <p className="text-slate-400 dark:text-slate-500">
          Thinking
          <Caret />
        </p>
      )}
      {turn.status === "canceled" && <p className="text-sm text-slate-400 dark:text-slate-500">Stopped.</p>}
      {turn.status === "failed" && (
        <p className="text-sm text-rose-500 dark:text-rose-400">{turn.error ?? "Something went wrong."}</p>
      )}
      {turn.status === "input-required" && turn.approvals && turn.approvals.length > 0 && (
        <ApprovalCard requests={turn.approvals} />
      )}
      <MessageFooter ts={turn.timestamp} copyText={canCopy && turn.text ? turn.text : undefined} />
    </div>
  );
}

export function Conversation() {
  const turns = useChatStore((s) => s.turns);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        {turns.map((turn) =>
          turn.role === "user" ? <UserTurn key={turn.id} turn={turn} /> : <AgentTurn key={turn.id} turn={turn} />,
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
