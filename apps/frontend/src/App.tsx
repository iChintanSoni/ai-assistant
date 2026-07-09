/**
 * Aurora — an AI-first assistant. A single non-scrolling viewport with a thin
 * icon rail, a soft aurora glow, and one focal interaction: an empty-state hub
 * that becomes a streaming conversation once you send a message.
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import { ClockIcon, Cog6ToothIcon, DocumentTextIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "./store/chat";
import { fetchModels } from "./lib/models";
import { ActiveDocuments } from "./components/ActiveDocuments";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { DocumentsPanel } from "./components/DocumentsPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useConversationRouting } from "./hooks/useConversationRouting";

const USER_NAME = "Chintan";

function App() {
  const turns = useChatStore((s) => s.turns);
  const modelsError = useChatStore((s) => s.modelsError);
  const setModels = useChatStore((s) => s.setModels);
  const setModelsError = useChatStore((s) => s.setModelsError);
  const newChat = useChatStore((s) => s.newChat);
  const hasChat = turns.length > 0;
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const documentsButtonRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  useConversationRouting();

  useEffect(() => {
    let active = true;
    fetchModels()
      .then((r) => {
        if (active) setModels(r.models, r.defaultModel);
      })
      .catch((e) => {
        if (active) setModelsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [setModels, setModelsError]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-200">
      <AuroraGlow />
      <Sidebar
        onNewChat={newChat}
        historyButtonRef={historyButtonRef}
        historyOpen={historyOpen}
        onToggleHistory={() => {
          setHistoryOpen((v) => !v);
          setDocumentsOpen(false);
          setSettingsOpen(false);
        }}
        documentsButtonRef={documentsButtonRef}
        documentsOpen={documentsOpen}
        onToggleDocuments={() => {
          setDocumentsOpen((v) => !v);
          setHistoryOpen(false);
          setSettingsOpen(false);
        }}
        settingsButtonRef={settingsButtonRef}
        settingsOpen={settingsOpen}
        onToggleSettings={() => {
          setSettingsOpen((v) => !v);
          setHistoryOpen(false);
          setDocumentsOpen(false);
        }}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={historyButtonRef}
      />
      <DocumentsPanel
        open={documentsOpen}
        onClose={() => setDocumentsOpen(false)}
        triggerRef={documentsButtonRef}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        triggerRef={settingsButtonRef}
      />

      <main className="relative z-10 flex flex-1 flex-col overflow-hidden px-6">
        {hasChat ? (
          <>
            <Conversation />
            <div className="shrink-0 pt-2 pb-6">
              <ActiveDocuments />
              <Composer />
              <ErrorNote message={modelsError} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <h1 className="mb-10 text-center text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100">
              Hi {USER_NAME},{" "}
              <span className="bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                let&apos;s get started
              </span>
            </h1>
            <ActiveDocuments />
            <Composer />
            <ErrorNote message={modelsError} />
          </div>
        )}
      </main>
    </div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mx-auto mt-3 max-w-2xl px-3 text-center text-sm text-rose-500 dark:text-rose-400">
      Can&apos;t reach the agent — {message}
    </p>
  );
}

/** Soft radial aurora glow — a few blurred pastel blobs behind the content. */
function AuroraGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-[62%] left-1/2 h-152 w-4xl -translate-1/2 animate-[float_9s_ease-in-out_infinite] rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/30" />
      <div className="absolute top-[58%] left-[44%] h-96 w-136 -translate-1/2 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-400/30" />
      <div className="absolute top-[66%] left-[57%] h-88 w-120 -translate-1/2 animate-[float_13s_ease-in-out_infinite] rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-400/25" />
    </div>
  );
}

/** Thin floating icon rail pinned to the far left. */
function Sidebar({
  onNewChat,
  historyButtonRef,
  historyOpen,
  onToggleHistory,
  documentsButtonRef,
  documentsOpen,
  onToggleDocuments,
  settingsButtonRef,
  settingsOpen,
  onToggleSettings,
}: {
  onNewChat: () => void;
  historyButtonRef: React.RefObject<HTMLButtonElement | null>;
  historyOpen: boolean;
  onToggleHistory: () => void;
  documentsButtonRef: React.RefObject<HTMLButtonElement | null>;
  documentsOpen: boolean;
  onToggleDocuments: () => void;
  settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  return (
    <nav className="relative z-20 flex h-full w-16 flex-col items-center justify-between py-6">
      <div className="flex flex-col items-center gap-2">
        <RailButton label="New chat" onClick={onNewChat}>
          <PlusIcon className="size-5" />
        </RailButton>
        <RailButton
          ref={historyButtonRef}
          label="History"
          onClick={onToggleHistory}
          active={historyOpen}
        >
          <ClockIcon className="size-5" />
        </RailButton>
        <RailButton
          ref={documentsButtonRef}
          label="Documents"
          onClick={onToggleDocuments}
          active={documentsOpen}
        >
          <DocumentTextIcon className="size-5" />
        </RailButton>
      </div>

      <div className="flex flex-col items-center gap-2">
        <RailButton
          ref={settingsButtonRef}
          label="Settings"
          onClick={onToggleSettings}
          active={settingsOpen}
        >
          <Cog6ToothIcon className="size-5" />
        </RailButton>
        <button
          type="button"
          aria-label="Profile"
          className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-sm font-medium text-white transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          {USER_NAME.charAt(0)}
        </button>
      </div>
    </nav>
  );
}

const RailButton = forwardRef<
  HTMLButtonElement,
  { label: string; onClick?: () => void; active?: boolean; children: React.ReactNode }
>(function RailButton({ label, onClick, active, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`group flex size-10 items-center justify-center rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
        active
          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
});

export default App;
