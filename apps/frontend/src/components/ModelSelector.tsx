/** Model selector pill + dropdown, populated live from the agent's /models. */
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../store/chat";
import type { ModelInfo } from "../lib/models";

function Badges({ model }: { model: ModelInfo }) {
  const tags: string[] = [];
  if (model.modalities.includes("image")) tags.push("vision");
  if (model.modalities.includes("audio")) tags.push("audio");
  if (model.thinking) tags.push("thinking");
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          {t}
        </span>
      ))}
    </span>
  );
}

export function ModelSelector() {
  const models = useChatStore((s) => s.models);
  const selected = useChatStore((s) => s.selectedModel);
  const selectModel = useChatStore((s) => s.selectModel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={models.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-slate-100/80 py-1.5 pr-2 pl-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-50 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80"
      >
        <SparklesIcon className="size-4 text-blue-500 dark:text-blue-400" />
        <span className="hidden max-w-[9rem] truncate sm:inline">{selected ?? "No models"}</span>
        <ChevronDownIcon className="size-4" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select model"
          className="absolute right-0 bottom-full z-30 mb-2 max-h-80 w-72 overflow-auto rounded-2xl bg-white/95 p-1.5 ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/95 dark:ring-slate-700/60"
        >
          {models.map((m) => {
            const isSelected = m.name === selected;
            return (
              <li key={m.name} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    selectModel(m.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:hover:bg-slate-800"
                >
                  <CheckIcon
                    className={`mt-0.5 size-4 shrink-0 ${isSelected ? "text-blue-500 dark:text-blue-400" : "text-transparent"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {m.name}
                    </span>
                    <span className="mt-1 block">
                      <Badges model={m} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
