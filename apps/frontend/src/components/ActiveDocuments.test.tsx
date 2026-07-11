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
import { ActiveDocuments } from "./ActiveDocuments";

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

beforeEach(() => {
  vi.mocked(getDocument).mockReset();
  useChatStore.setState({ activeDocumentIds: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders nothing when there are no active documents", () => {
  const { container } = render(<ActiveDocuments />);
  expect(container).toBeEmptyDOMElement();
});

test("shows a placeholder then the document name once it loads", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  vi.mocked(getDocument).mockResolvedValue(doc());

  render(<ActiveDocuments />);

  expect(screen.getByText("Loading…")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
});

test("shows a failed document with its error as a tooltip", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-2"] });
  vi.mocked(getDocument).mockResolvedValue(doc({ id: "doc-2", originalName: "bad.pdf", status: "failed", error: "Docling crashed" }));

  render(<ActiveDocuments />);

  await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
  expect(screen.getByTitle("Docling crashed")).toBeInTheDocument();
});

test("removing a document calls removeActiveDocument", async () => {
  useChatStore.setState({ activeDocumentIds: ["doc-3"] });
  vi.mocked(getDocument).mockResolvedValue(doc({ id: "doc-3", originalName: "a.pdf" }));
  const user = userEvent.setup();

  render(<ActiveDocuments />);
  await waitFor(() => expect(screen.getByText("a.pdf")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /remove a.pdf/i }));

  expect(useChatStore.getState().activeDocumentIds).toEqual([]);
});
