/** Whole-pane drag-and-drop: tracks drag-over state and hands dropped files to a callback. */
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

export function useFileDrop(onDropFiles: (files: File[]) => void) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  // dragenter/dragleave bubble from every child element the pointer crosses,
  // not just the wrapper — a depth counter (not a boolean) is what keeps the
  // overlay from flickering as the drag moves over nested elements.
  const depthRef = useRef(0);

  useEffect(() => {
    // Safety net: a file dropped outside the drop zone (e.g. the sidebar
    // rail) would otherwise make the browser navigate away from the app.
    function preventDefault(e: globalThis.DragEvent) {
      e.preventDefault();
    }
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  const dropZoneProps = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setIsDraggingFiles(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setIsDraggingFiles(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depthRef.current = 0;
      setIsDraggingFiles(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onDropFiles(files);
    },
  };

  return { isDraggingFiles, dropZoneProps };
}
