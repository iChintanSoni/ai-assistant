/**
 * Soft radial aurora glow — a few blurred pastel blobs behind the content.
 *
 * Lives on its own (rather than inside the layout that renders it) because the
 * router's hydrate fallback paints it too: a deep-linked conversation has to show
 * *something* while its loader runs, and the glow alone is the calmest thing to
 * show. Purely decorative — aria-hidden and non-interactive.
 */
export function AuroraGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-[62%] left-1/2 h-152 w-4xl -translate-1/2 animate-[float_9s_ease-in-out_infinite] rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/30" />
      <div className="absolute top-[58%] left-[44%] h-96 w-136 -translate-1/2 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-400/30" />
      <div className="absolute top-[66%] left-[57%] h-88 w-120 -translate-1/2 animate-[float_13s_ease-in-out_infinite] rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-400/25" />
    </div>
  );
}
