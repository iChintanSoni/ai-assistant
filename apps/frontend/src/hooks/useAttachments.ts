/**
 * Shared attachment intake: used by both the paperclip file picker and
 * drag-and-drop. Documents are uploaded + registered immediately (as today);
 * other files (image/audio) are staged locally until the message is sent.
 * Enforces MAX_ATTACHMENTS across documents-active-in-conversation + staged
 * attachments combined.
 */
import { useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENTS } from "../lib/config";
import { isDocumentFile, isLegacyOfficeFile, registerDocument } from "../lib/documents";
import { isAcceptableOtherFile } from "../lib/models";
import { uploadFile } from "../lib/upload";
import { useChatStore } from "../store/chat";

export interface PendingAttachment {
  file: File;
  previewUrl?: string;
}

type Classified = { file: File; kind: "document" | "other" };

export function useAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // addFiles needs the latest count synchronously (it can run twice back to
  // back across renders), not a stale closure over the last render's state.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  async function uploadDocument(file: File) {
    try {
      const uploaded = await uploadFile(file);
      const doc = await registerDocument({
        url: uploaded.url,
        filename: file.name,
        mimetype: uploaded.mimetype,
        size: uploaded.size,
      });
      useChatStore.getState().addActiveDocument(doc.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : `Couldn't upload "${file.name}".`);
    }
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;

    const store = useChatStore.getState();
    const model = store.models.find((m) => m.name === store.selectedModel);

    const supported: Classified[] = [];
    const legacyOffice: File[] = [];
    const unsupported: File[] = [];
    for (const file of files) {
      // Vision/audio-capable models claim images/audio first, ahead of the
      // document fallback below, so a vision model still gets to look at a
      // dropped photo directly instead of it being OCR'd into a document.
      if (isAcceptableOtherFile(file, model)) supported.push({ file, kind: "other" });
      else if (isDocumentFile(file, model)) supported.push({ file, kind: "document" });
      else if (isLegacyOfficeFile(file)) legacyOffice.push(file);
      else unsupported.push(file);
    }

    const activeCount = store.activeDocumentIds.length + attachmentsRef.current.length;
    const remaining = Math.max(0, MAX_ATTACHMENTS - activeCount);
    const accepted = supported.slice(0, remaining);
    const overflow = supported.slice(remaining);

    const messages: string[] = [];
    if (legacyOffice.length > 0) {
      messages.push(
        legacyOffice.length === 1
          ? `"${legacyOffice[0]!.name}" is an old Word/Excel/PowerPoint format — save it as .docx/.xlsx/.pptx and try again.`
          : `${legacyOffice.length} files are an old Word/Excel/PowerPoint format — save them as .docx/.xlsx/.pptx and try again.`,
      );
    }
    if (unsupported.length > 0) {
      messages.push(
        unsupported.length === 1
          ? `"${unsupported[0]!.name}" isn't a supported file type.`
          : `${unsupported.length} files aren't a supported type.`,
      );
    }
    if (overflow.length > 0) {
      messages.push(
        `Only ${MAX_ATTACHMENTS} files can be attached at once — ${overflow.length} file${overflow.length === 1 ? "" : "s"} weren't added.`,
      );
    }
    setNotice(messages.length > 0 ? messages.join(" ") : null);

    const newOther = accepted
      .filter((c) => c.kind === "other")
      .map((c) => ({
        file: c.file,
        previewUrl: c.file.type.startsWith("image/") ? URL.createObjectURL(c.file) : undefined,
      }));
    if (newOther.length > 0) setAttachments((prev) => [...prev, ...newOther]);

    for (const c of accepted) if (c.kind === "document") void uploadDocument(c.file);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, j) => j !== index);
    });
  }

  function clear() {
    for (const a of attachmentsRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    setAttachments([]);
    setNotice(null);
  }

  return { attachments, notice, addFiles, removeAttachment, clear };
}
