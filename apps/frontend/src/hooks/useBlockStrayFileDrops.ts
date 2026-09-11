/**
 * Stops a file dropped anywhere outside a real drop zone from navigating the tab
 * away from the app — the browser's default action for a dropped file is to open
 * it, which tears down the whole SPA.
 *
 * Separate from useFileDrop, and called from the layout rather than a route,
 * because it has to be mounted on *every* view. The drop zone itself is chat-only;
 * this guard is not.
 */
import { useEffect } from "react";

export function useBlockStrayFileDrops(): void {
  useEffect(() => {
    function preventDefault(e: DragEvent) {
      e.preventDefault();
    }
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);
}
