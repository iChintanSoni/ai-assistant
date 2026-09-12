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
import { useAttachments } from "../hooks/useAttachments";
import { useBlockStrayFileDrops } from "../hooks/useBlockStrayFileDrops";
import { useConversationUrlSync } from "../hooks/useConversationUrlSync";
import { useFocusOnRouteChange } from "../hooks/useFocusOnRouteChange";
import { USER_NAME } from "../lib/config";
import { fetchModels } from "../lib/models";
import { routeViewFromPath } from "../lib/routeView";
import { useChatStore } from "../store/chat";

// h-dvh, not h-screen: 100vh on mobile measures the viewport with the browser
// toolbar hidden, so the bottom of the layout — where the composer lives — sits
// below the fold. Identical to 100vh on desktop.
const SHELL_CLASS =
  "relative flex h-dvh w-full flex-col overflow-hidden bg-white font-sans text-slate-800 antialiased md:flex-row dark:bg-slate-950 dark:text-slate-200";

export type AttachmentsContext = ReturnType<typeof useAttachments>;

export function RootLayout() {
  const setModels = useChatStore((s) => s.setModels);
  const setModelsError = useChatStore((s) => s.setModelsError);
  const newChat = useChatStore((s) => s.newChat);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = routeViewFromPath(pathname);
  // useNavigate doesn't dedupe a push to the path you're already on the way <Link>
  // does, so clicking a rail button twice would stack identical history entries and
  // make Back look broken.
  const go = (to: string) => {
    if (pathname !== to) void navigate(to);
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  useFocusOnRouteChange();
  useConversationUrlSync();
  useBlockStrayFileDrops();
  // Staged attachments live here, not in the chat route: the route unmounts on a
  // trip to Files or Settings, which would silently discard files the user had
  // already picked (and leak their object URLs, since nothing revokes them on
  // unmount). Handed to the chat view through the outlet.
  const attachments = useAttachments();

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
      {/* Outlet before the nav: on a phone the bar is visually last, so this is
          what keeps tab order matching what the user sees. md:order-first on the
          nav puts the rail back on the left without moving it back up the tab
          sequence. */}
      <Outlet context={attachments} />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={historyButtonRef}
      />
      <Sidebar
        onNewChat={() => {
          newChat();
          go("/");
        }}
        historyButtonRef={historyButtonRef}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        filesOpen={view === "files"}
        onOpenFiles={() => {
          go("/files");
          setHistoryOpen(false);
        }}
        settingsOpen={view === "settings"}
        onOpenSettings={() => {
          go("/settings");
          setHistoryOpen(false);
        }}
      />
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

/**
 * Navigation, in two lanes: a bottom bar on phones — where thumbs are, and where
 * it costs no horizontal room — and the thin floating rail from `md:` up.
 *
 * One <nav> with responsive classes rather than two components, so there is never
 * a duplicate set of nav buttons in the accessibility tree (CSS `hidden` wouldn't
 * hide the second set from assistive tech queries or from tests, which don't
 * evaluate Tailwind breakpoints).
 */
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
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around bg-white/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ring-1 ring-slate-200/70 backdrop-blur-md md:relative md:inset-auto md:order-first md:h-full md:w-16 md:flex-col md:justify-between md:bg-transparent md:px-0 md:py-6 md:ring-0 md:backdrop-blur-none dark:bg-slate-900/70 dark:ring-slate-700/60 md:dark:bg-transparent"
    >
      <div className="flex items-center gap-1 md:flex-col md:gap-2">
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

      <div className="flex items-center gap-1 md:flex-col md:gap-2">
        <RailButton label="Settings" onClick={onOpenSettings} active={settingsOpen}>
          <Cog6ToothIcon className="size-5" />
        </RailButton>
        {/* The avatar stays 36px visually; the button pads out to the 44px touch floor. */}
        <button
          type="button"
          aria-label="Profile"
          className="flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 pointer-coarse:size-11 md:size-9 md:pointer-coarse:size-11"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-sm font-medium text-white">
            {USER_NAME.charAt(0)}
          </span>
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
      className={`group flex size-10 items-center justify-center rounded-full pointer-coarse:size-11 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
        active
          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
});
