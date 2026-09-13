/**
 * Landing page for a file shared to the installed app via the OS "Share"/
 * "Open with" sheet (sw.ts intercepts the manifest's share_target POST and
 * redirects here). Recovers the file(s) from pendingShareStore and hands them
 * to the same attachments.addFiles the paperclip/drag-drop use — no ingest
 * logic is reimplemented — then returns to the chat hub.
 */
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { takePendingShare } from "../lib/pendingShareStore";
import type { AttachmentsContext } from "./RootLayout";
import { PageMain } from "./PageMain";

export function ShareTargetRoute() {
  const { addFiles } = useOutletContext<AttachmentsContext>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "empty">("loading");

  // Runs once on mount, deliberately: takePendingShare() consumes the pending
  // share (a second call harmlessly returns []), so re-running this on an
  // unrelated re-render can't double-add a file — it would just no-op.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const files = await takePendingShare();
      if (cancelled) return;
      if (files.length === 0) {
        setStatus("empty");
        return;
      }
      addFiles(files);
      navigate("/", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, []);

  return (
    <PageMain>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        {status === "loading" ? (
          <p className="text-lg text-slate-600 dark:text-slate-300">Adding your shared file…</p>
        ) : (
          <>
            <p className="text-lg text-slate-900 dark:text-slate-100">Nothing to add</p>
            <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
              This page opens when you share a file to Aurora Assistant from another app.
            </p>
          </>
        )}
      </div>
    </PageMain>
  );
}
