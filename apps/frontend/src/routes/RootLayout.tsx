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
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { USER_NAME } from "../lib/config";
import { fetchModels } from "../lib/models";
import { routeViewFromPath } from "../lib/routeView";
import { useChatStore } from "../store/chat";

// h-dvh, not h-screen: 100vh on mobile measures the viewport with the browser
// toolbar hidden, so the bottom of the layout — where the composer lives — sits
// below the fold. Identical to 100vh on desktop.
const SHELL_CLASS =
  "relative flex h-dvh w-full flex-col overflow-hidden bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] font-sans text-slate-800 antialiased md:flex-row dark:bg-slate-950 dark:text-slate-200";

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
  // 0 unless the browser ignores interactive-widget (i.e. iOS Safari).
  const keyboardInset = useKeyboardInset();
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
    <div className={SHELL_CLASS} style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}>
      {/* The nav is first in the DOM — it's a landmark, and on desktop it's also
          visually first. On a phone the bar is visually last, so the skip link is
          what keeps that from costing keyboard users five tabs before the
          composer. Reordering with CSS instead would fix one lane by breaking the
          other. */}
      <a
        href="#main"
        className="sr-only rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-900 dark:text-slate-100"
      >
        Skip to content
      </a>
      <AuroraGlow />
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
      <Outlet context={attachments} />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={historyButtonRef}
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
 * One <nav> with responsive classes rather than two components. `display: none`
 * would correctly hide a second nav from real browsers and assistive tech — the
 * reason to prefer one element is jsdom, which never loads the Tailwind stylesheet,
 * so tests would see both sets of buttons and every getByRole would be ambiguous.
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
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around bg-white/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ring-1 ring-slate-200/70 backdrop-blur-md md:relative md:inset-auto md:h-full md:w-16 md:flex-col md:justify-between md:bg-transparent md:px-0 md:py-6 md:ring-0 md:backdrop-blur-none dark:bg-slate-900/70 dark:ring-slate-700/60 md:dark:bg-transparent"
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
          className="flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 pointer-coarse:size-11 md:size-9"
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
