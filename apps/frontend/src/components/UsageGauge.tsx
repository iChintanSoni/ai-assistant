/** Small radial gauge: how much of the model's context window this conversation has used. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore, type TurnUsage, type UITurn } from "../store/chat";
import { formatTokens } from "../lib/tokens";

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColorClass(pct: number): string {
  if (pct >= 0.9) return "text-rose-500 dark:text-rose-400";
  if (pct >= 0.75) return "text-amber-500 dark:text-amber-400";
  return "text-blue-500 dark:text-blue-400";
}

/**
 * Each turn's `usage` is already that turn's own new-context contribution (the
 * backend folds multi-call tool-loops the same way — see streaming.ts). Ollama
 * reuses its KV cache across calls, so a later turn's own numbers are normally
 * just the incremental addition, not a full-conversation snapshot; but if a
 * turn's own inputTokens ever meets or exceeds the running total, treat it as
 * an authoritative fresh total instead of stacking (avoids double-counting
 * either way, regardless of whether caching was in effect for that call).
 */
function foldUsage(acc: TurnUsage, sample: TurnUsage): TurnUsage {
  if (sample.inputTokens >= acc.totalTokens) return sample;
  return {
    inputTokens: acc.inputTokens + sample.inputTokens,
    outputTokens: acc.outputTokens + sample.outputTokens,
    totalTokens: acc.totalTokens + sample.totalTokens,
  };
}

function cumulativeUsage(turns: UITurn[]): TurnUsage | undefined {
  let acc: TurnUsage | undefined;
  for (const t of turns) {
    if (t.role !== "agent" || !t.usage) continue;
    acc = acc ? foldUsage(acc, t.usage) : t.usage;
  }
  return acc;
}

export function UsageGauge() {
  const models = useChatStore((s) => s.models);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const turns = useChatStore((s) => s.turns);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const contextLength = models.find((m) => m.name === selectedModel)?.contextLength ?? null;

  const cumulative = useMemo(() => cumulativeUsage(turns), [turns]);

  const lastUsageTurn = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === "agent" && t.usage) return t;
    }
    return undefined;
  }, [turns]);

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

  const thisTurn = lastUsageTurn?.usage;
  const hasData = Boolean(contextLength && cumulative);
  const pct = hasData && contextLength ? Math.min(cumulative!.totalTokens / contextLength, 1) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const pctLabel = hasData ? `${Math.round(pct * 100)}%` : "";

  const subagentUsages = (lastUsageTurn?.subagents ?? []).filter((sa) => sa.usage);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={hasData ? `Context usage: ${pctLabel} used` : "Context usage"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-500 dark:hover:bg-slate-800"
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-slate-200/70 dark:text-slate-700/60"
          />
          {hasData && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              className={`transition-[stroke-dashoffset] duration-300 ${ringColorClass(pct)}`}
            />
          )}
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Context usage details"
          className="absolute right-0 bottom-full z-30 mb-2 w-64 rounded-2xl bg-white/95 p-3 text-sm ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/95 dark:ring-slate-700/60"
        >
          {!contextLength ? (
            <p className="text-slate-500 dark:text-slate-400">Context size for this model is unknown.</p>
          ) : !cumulative || !thisTurn ? (
            <p className="text-slate-500 dark:text-slate-400">No usage data yet — send a message to see context usage.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {formatTokens(cumulative.totalTokens)} / {formatTokens(contextLength)} tokens ({pctLabel})
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                This turn: {formatTokens(thisTurn.inputTokens)} in · {formatTokens(thisTurn.outputTokens)} out
              </p>
              {subagentUsages.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {subagentUsages.map((sa) => (
                    <p key={sa.id} className="text-slate-500 dark:text-slate-400">
                      {sa.name}: {formatTokens(sa.usage!.inputTokens)} in · {formatTokens(sa.usage!.outputTokens)} out
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
