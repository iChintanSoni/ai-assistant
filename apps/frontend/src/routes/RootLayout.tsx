/**
 * Aurora's shell: the aurora glow, the thin icon rail, the History flyout, and a
 * slot for whichever view is routed. Everything here persists across navigation —
 * view-specific chrome belongs in the route components instead.
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import { ClockIcon, Cog6ToothIcon, FolderIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AuroraGlow } from "../components/AuroraGlow";
import { HistoryPanel } from "../components/HistoryPanel";
import { useConversationUrlSync } from "../hooks/useConversationUrlSync";
import { useFocusOnRouteChange } from "../hooks/useFocusOnRouteChange";
import { USER_NAME } from "../lib/config";
import { fetchModels } from "../lib/models";
import { routeViewFromPath } from "../lib/routeView";
import { useChatStore } from "../store/chat";

const SHELL_CLASS =
  "relative flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-200";

export function RootLayout() {
  const setModels = useChatStore((s) => s.setModels);
  const setModelsError = useChatStore((s) => s.setModelsError);
  const newChat = useChatStore((s) => s.newChat);
  const navigate = useNavigate();
  const view = routeViewFromPath(useLocation().pathname);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  useFocusOnRouteChange();
  useConversationUrlSync();

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
    <div className={SHELL_CLASS}>
      <AuroraGlow />
      <Sidebar
        onNewChat={() => {
          newChat();
          void navigate("/");
        }}
        historyButtonRef={historyButtonRef}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        filesOpen={view === "files"}
        onOpenFiles={() => {
          void navigate("/files");
          setHistoryOpen(false);
        }}
        settingsOpen={view === "settings"}
        onOpenSettings={() => {
          void navigate("/settings");
          setHistoryOpen(false);
        }}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={historyButtonRef}
      />
      <Outlet />
    </div>
  );
}

/**
 * What the router paints while an initial route loader runs — i.e. a deep-linked or
 * refreshed `/c/:id`, whose transcript has to be fetched before there's anything to
 * render. Just the shell's background, so the app never flashes a blank white page.
 */
export function RootFallback() {
  return (
    <div className={SHELL_CLASS}>
      <AuroraGlow />
    </div>
  );
}

/** Thin floating icon rail pinned to the far left. */
function Sidebar({
  onNewChat,
  historyButtonRef,
  historyOpen,
  onToggleHistory,
  filesOpen,
  onOpenFiles,
  settingsOpen,
  onOpenSettings,
}: {
  onNewChat: () => void;
  historyButtonRef: React.RefObject<HTMLButtonElement | null>;
  historyOpen: boolean;
  onToggleHistory: () => void;
  filesOpen: boolean;
  onOpenFiles: () => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
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
        <RailButton label="Files" onClick={onOpenFiles} active={filesOpen}>
          <FolderIcon className="size-5" />
        </RailButton>
      </div>

      <div className="flex flex-col items-center gap-2">
        <RailButton label="Settings" onClick={onOpenSettings} active={settingsOpen}>
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
