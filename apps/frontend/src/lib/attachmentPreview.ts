export interface ViewableAttachment {
  name: string;
  url: string;
  mimeType: string;
}

export function canPreviewAttachment(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf"
  );
}
