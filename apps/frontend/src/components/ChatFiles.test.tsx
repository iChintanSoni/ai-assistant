import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/documents")>();
  return { ...actual, getDocument: vi.fn() };
});

import { getDocument } from "../lib/documents";
import type { DocumentSummary } from "../lib/documents";
import { useChatStore } from "../store/chat";
import { ChatFiles } from "./ChatFiles";
import type { PendingAttachment } from "../hooks/useAttachments";

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    originalName: "report.pdf",
    mimeType: "application/pdf",
    size: 1,
    pageCount: 1,
    sizeClass: "small",
    summary: null,
    summaryStatus: "pending",
    status: "ready",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function setup(attachments: PendingAttachment[] = []) {
  const removeAttachment = vi.fn();
  const utils = render(<ChatFiles attachments={attachments} removeAttachment={removeAttachment} />);
  return { ...utils, removeAttachment };
}

beforeEach(() => {
  vi.mocked(getDocument).mockReset();
  useChatStore.setState({ activeDocumentIds: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders nothing when there are no active documents or pending attachments", () => {
  const { container } = setup();
  expect(container).toBeEmptyDOMElement();
});

test("shows a placeholder then the document name once it loads", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  vi.mocked(getDocument).mockResolvedValue(doc());

  setup();

  expect(screen.getByText("Loading…")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
});

test("shows a failed document with its error as a tooltip", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-2"] });
  vi.mocked(getDocument).mockResolvedValue(doc({ id: "doc-2", originalName: "bad.pdf", status: "failed", error: "Docling crashed" }));

  setup();

  await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
  expect(screen.getByTitle("Docling crashed")).toBeInTheDocument();
});

test("shows a distinct state when the document was deleted from the library", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-4"] });
  vi.mocked(getDocument).mockRejectedValue(new Error("HTTP 404"));

  setup();

  await waitFor(() => expect(screen.getByText("Removed from library")).toBeInTheDocument());
});

test("removing a document calls removeActiveDocument", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-3"] });
  vi.mocked(getDocument).mockResolvedValue(doc({ id: "doc-3", originalName: "a.pdf" }));
  const user = userEvent.setup();

  setup();
  await waitFor(() => expect(screen.getByText("a.pdf")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /remove a.pdf/i }));

  expect(useChatStore.getState().activeDocumentIds).toEqual([]);
});

test("renders a preview image for an image attachment and a plain chip otherwise", () => {
  setup([
    { file: new File(["x"], "photo.png", { type: "image/png" }), previewUrl: "blob:preview" },
    { file: new File(["x"], "clip.mp3", { type: "audio/mpeg" }) },
  ]);

  // The preview <img> has alt="" (decorative), which removes it from the accessibility
  // tree's "img" role entirely, so it must be queried by its alt text instead.
  expect(screen.getByAltText("")).toHaveAttribute("src", "blob:preview");
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  expect(screen.getByText("clip.mp3")).toBeInTheDocument();
});

test("removing a pending attachment calls removeAttachment with its index", async () => {
  const user = userEvent.setup();
  const { removeAttachment } = setup([
    { file: new File(["x"], "a.png", { type: "image/png" }) },
    { file: new File(["x"], "b.png", { type: "image/png" }) },
  ]);

  await user.click(screen.getByRole("button", { name: "Remove b.png" }));

  expect(removeAttachment).toHaveBeenCalledWith(1);
});

test("shows both active documents and pending attachments together", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  vi.mocked(getDocument).mockResolvedValue(doc());

  setup([{ file: new File(["x"], "photo.png", { type: "image/png" }) }]);

  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
  expect(screen.getByText("photo.png")).toBeInTheDocument();
});
