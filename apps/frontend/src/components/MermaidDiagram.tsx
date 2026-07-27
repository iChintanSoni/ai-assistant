/** Renders a ```mermaid fenced code block as an inline diagram (SVG), not raw code. */
import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import { useThemeStore } from "../store/theme";

let initializedTheme: "light" | "dark" | null = null;

function ensureInitialized(theme: "light" | "dark") {
  if (initializedTheme === theme) return;
  mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default", securityLevel: "strict" });
  initializedTheme = theme;
}

export function MermaidDiagram({ code }: { code: string }) {
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureInitialized(resolvedTheme);
    setError(null);
    mermaid
      .render(`mermaid-${rawId}`, code)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) containerRef.current.innerHTML = svg;
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, rawId, resolvedTheme]);

  if (error) {
    return (
      <div className="overflow-x-auto rounded-2xl bg-slate-50/70 p-3 text-sm text-slate-700 ring-1 ring-slate-200/60 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-700/50">
        <p className="mb-2 text-rose-600 dark:text-rose-400">Couldn't render this diagram: {error}</p>
        <pre className="whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-200/60 [&_svg]:mx-auto dark:bg-slate-900/60 dark:ring-slate-700/50"
    />
  );
}
