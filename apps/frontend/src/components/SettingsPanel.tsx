/** Floating flyout for app settings — opened from the rail's Settings button. */
import { useEffect, useRef } from "react";
import { ComputerDesktopIcon, MoonIcon, SunIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useThemeStore, type ThemePreference } from "../store/theme";

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "auto", label: "Auto", icon: ComputerDesktopIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function SettingsPanel({ open, onClose, triggerRef }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerRef]);

  if (!open) return null;

  function close() {
    onClose();
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Settings"
      className="fixed bottom-6 left-20 z-30 flex w-80 flex-col gap-4 rounded-3xl bg-white/80 p-4 ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/80 dark:ring-slate-700/60"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Settings</span>
        <button
          type="button"
          aria-label="Close settings"
          onClick={close}
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-1">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
          Appearance
        </span>
        <AppearanceControl />
      </div>
    </div>
  );
}

function AppearanceControl() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const buttonRefs = useRef<Partial<Record<ThemePreference, HTMLButtonElement>>>({});

  function move(delta: 1 | -1) {
    const i = APPEARANCE_OPTIONS.findIndex((o) => o.value === preference);
    const next = APPEARANCE_OPTIONS[(i + delta + APPEARANCE_OPTIONS.length) % APPEARANCE_OPTIONS.length];
    if (!next) return;
    setPreference(next.value);
    // Roving tabindex: keyboard focus must follow the newly active radio, not stay put.
    buttonRefs.current[next.value]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:ring-slate-700/60"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {APPEARANCE_OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = value === preference;
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[value] = el ?? undefined;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setPreference(value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              checked
                ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
