import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/documents")>();
  return { ...actual, listDocuments: vi.fn(), deleteDocument: vi.fn() };
});

import { deleteDocument, listDocuments } from "../lib/documents";
import type { DocumentSummary } from "../lib/documents";
import { useChatStore } from "../store/chat";
import { DocumentsPanel } from "./DocumentsPanel";

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    originalName: "report.pdf",
    mimeType: "application/pdf",
    size: 1,
    pageCount: 1,
    sizeClass: "small",
    summary: null,
    summaryStatus: "ready",
    status: "ready",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function renderPanel(open = true) {
  const ref = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const utils = render(<DocumentsPanel open={open} onClose={onClose} triggerRef={ref} />);
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.mocked(listDocuments).mockReset().mockResolvedValue([]);
  vi.mocked(deleteDocument).mockReset().mockResolvedValue(undefined);
  useChatStore.setState({ activeDocumentIds: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders nothing when closed", () => {
  const { container } = renderPanel(false);
  expect(container).toBeEmptyDOMElement();
});

test("shows a load error when the document list fails to fetch", async () => {
  vi.mocked(listDocuments).mockRejectedValue(new Error("network down"));
  renderPanel();
  await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
});

test("shows an empty-state message when there are no documents", async () => {
  renderPanel();
  await waitFor(() => expect(screen.getByText(/No documents yet/)).toBeInTheDocument());
});

test("clicking a ready document activates it, clicking again deactivates it", async () => {
  vi.mocked(listDocuments).mockResolvedValue([doc()]);
  const user = userEvent.setup();
  renderPanel();

  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
  // The row's own accessible name starts with the filename; the separate delete
  // button's name is `Delete "report.pdf"`, which would also match a loose substring query.
  const row = screen.getByRole("button", { name: (name) => name.startsWith("report.pdf") });

  await user.click(row);
  expect(useChatStore.getState().activeDocumentIds).toEqual(["doc-1"]);

  await user.click(row);
  expect(useChatStore.getState().activeDocumentIds).toEqual([]);
});

test("a pending document can't be activated", async () => {
  vi.mocked(listDocuments).mockResolvedValue([doc({ status: "pending" })]);
  renderPanel();
  await waitFor(() => expect(screen.getByText("Processing…")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: (name) => name.startsWith("report.pdf") })).toBeDisabled();
});

test("delete requires a confirming second click, then removes the document", async () => {
  vi.mocked(listDocuments).mockResolvedValue([doc()]);
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  const user = userEvent.setup();
  renderPanel();
  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "report.pdf"' }));
  expect(screen.getByRole("button", { name: 'Confirm delete "report.pdf"' })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Confirm delete "report.pdf"' }));

  expect(deleteDocument).toHaveBeenCalledWith("doc-1");
  expect(useChatStore.getState().activeDocumentIds).toEqual([]);
  await waitFor(() => expect(screen.queryByText("report.pdf")).not.toBeInTheDocument());
});

test("a failed delete shows an error message", async () => {
  vi.mocked(listDocuments).mockResolvedValue([doc()]);
  vi.mocked(deleteDocument).mockRejectedValue(new Error("delete failed"));
  const user = userEvent.setup();
  renderPanel();
  await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "report.pdf"' }));
  await user.click(screen.getByRole("button", { name: 'Confirm delete "report.pdf"' }));

  await waitFor(() => expect(screen.getByText("delete failed")).toBeInTheDocument());
});

test("Escape closes the panel", async () => {
  const user = userEvent.setup();
  const { onClose } = renderPanel();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
