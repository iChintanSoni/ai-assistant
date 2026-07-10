/** Full-pane visual feedback shown while a file is being dragged over the chat interface. */
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { MAX_ATTACHMENTS } from "../lib/config";

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-md dark:bg-slate-950/70"
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/80 px-10 py-8 ring-2 ring-dashed ring-blue-300/60 backdrop-blur-md dark:bg-slate-900/80 dark:ring-blue-400/40">
        <ArrowUpTrayIcon className="size-8 text-blue-500 dark:text-blue-400" />
        <div className="text-center">
          <p className="text-base font-medium text-slate-800 dark:text-slate-100">Drop files to attach</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Up to {MAX_ATTACHMENTS} files</p>
        </div>
      </div>
    </div>
  );
}
