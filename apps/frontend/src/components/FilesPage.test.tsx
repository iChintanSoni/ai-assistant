import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("../lib/attachments", () => ({ listAttachments: vi.fn(), deleteAttachment: vi.fn() }));
vi.mock("../lib/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/documents")>();
  return { ...actual, deleteDocument: vi.fn() };
});
vi.mock("../lib/history", () => ({ getConversation: vi.fn() }));

import { deleteAttachment, listAttachments } from "../lib/attachments";
import type { AttachmentItem } from "../lib/attachments";
import { deleteDocument } from "../lib/documents";
import { getConversation } from "../lib/history";
import { useChatStore } from "../store/chat";
import { FilesPage } from "./FilesPage";

function item(overrides: Partial<AttachmentItem> = {}): AttachmentItem {
  return {
    id: "a1",
    url: "http://files/a.png",
    originalName: "a.png",
    mimeType: "image/png",
    size: 2048,
    kind: "attachment",
    createdAt: Date.now(),
    usedIn: [],
    ...overrides,
  };
}

function renderPage() {
  return render(<FilesPage />);
}

beforeEach(() => {
  vi.mocked(listAttachments).mockReset().mockResolvedValue([]);
  navigate.mockReset();
  vi.mocked(deleteAttachment).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteDocument).mockReset().mockResolvedValue(undefined);
  vi.mocked(getConversation).mockReset();
  useChatStore.setState({ activeDocumentIds: [], contextId: null, turns: [] });
  vi.stubGlobal("open", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("shows an empty-state message when there are no files", async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText(/No files yet/)).toBeInTheDocument());
});

test("shows a load error when fetching fails", async () => {
  vi.mocked(listAttachments).mockRejectedValue(new Error("network down"));
  renderPage();
  await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
});

test("lists files and filters them by the search box", async () => {
  vi.mocked(listAttachments).mockResolvedValue([item({ id: "a1", originalName: "alpha.png" }), item({ id: "a2", originalName: "beta.png" })]);
  const user = userEvent.setup();
  renderPage();

  await waitFor(() => expect(screen.getByText("alpha.png")).toBeInTheDocument());
  expect(screen.getByText("beta.png")).toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: /search files/i }), "alpha");

  expect(screen.getByText("alpha.png")).toBeInTheDocument();
  expect(screen.queryByText("beta.png")).not.toBeInTheDocument();
});

test("the kind filter narrows the list to documents only", async () => {
  vi.mocked(listAttachments).mockResolvedValue([
    item({ id: "a1", originalName: "doc.pdf", kind: "document", mimeType: "application/pdf" }),
    item({ id: "a2", originalName: "upload.png", kind: "attachment" }),
  ]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("doc.pdf")).toBeInTheDocument());

  await user.click(screen.getByRole("radio", { name: "Documents" }));

  expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  expect(screen.queryByText("upload.png")).not.toBeInTheDocument();
});

test("the Generated filter groups every generated-* kind (image, document, diagram) together", async () => {
  vi.mocked(listAttachments).mockResolvedValue([
    item({ id: "a1", originalName: "pic.png", kind: "generated-image" }),
    item({ id: "a2", originalName: "report.docx", kind: "generated-document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    item({ id: "a3", originalName: "flow.drawio", kind: "generated-diagram", mimeType: "application/xml" }),
    item({ id: "a4", originalName: "upload.png", kind: "attachment" }),
  ]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("pic.png")).toBeInTheDocument());

  await user.click(screen.getByRole("radio", { name: "Generated" }));

  expect(screen.getByText("pic.png")).toBeInTheDocument();
  expect(screen.getByText("report.docx")).toBeInTheDocument();
  expect(screen.getByText("flow.drawio")).toBeInTheDocument();
  expect(screen.queryByText("upload.png")).not.toBeInTheDocument();
});

test("switching to list view shows the table header row", async () => {
  vi.mocked(listAttachments).mockResolvedValue([item()]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());

  await user.click(screen.getByRole("radio", { name: "List view" }));

  expect(screen.getByText("Conversation")).toBeInTheDocument();
});

test("clicking a file tile opens it in a new tab", async () => {
  vi.mocked(listAttachments).mockResolvedValue([item({ url: "http://files/a.png" })]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Open a.png" }));

  expect(window.open).toHaveBeenCalledWith("http://files/a.png", "_blank", "noopener,noreferrer");
});

test("deleting a plain attachment requires confirmation, then calls deleteAttachment", async () => {
  vi.mocked(listAttachments).mockResolvedValue([item()]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "a.png"' }));
  expect(screen.getByText(/tap delete again to remove/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Confirm delete "a.png"' }));

  expect(deleteAttachment).toHaveBeenCalledWith("a1");
  await waitFor(() => expect(screen.queryByText("a.png")).not.toBeInTheDocument());
});

test("deleting a document deletes via deleteDocument and clears it from active documents", async () => {
  vi.mocked(listAttachments).mockResolvedValue([
    item({ id: "a1", originalName: "doc.pdf", kind: "document", mimeType: "application/pdf", documentId: "doc-1" }),
  ]);
  useChatStore.setState({ activeDocumentIds: ["doc-1"] });
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("doc.pdf")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "doc.pdf"' }));
  await user.click(screen.getByRole("button", { name: 'Confirm delete "doc.pdf"' }));

  expect(deleteDocument).toHaveBeenCalledWith("doc-1");
  expect(useChatStore.getState().activeDocumentIds).toEqual([]);
});

test("a failed delete shows an error and restores the item via refresh", async () => {
  vi.mocked(listAttachments).mockResolvedValueOnce([item()]).mockResolvedValueOnce([item()]);
  vi.mocked(deleteAttachment).mockRejectedValue(new Error("delete failed"));
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "a.png"' }));
  await user.click(screen.getByRole("button", { name: 'Confirm delete "a.png"' }));

  await waitFor(() => expect(screen.getByText("delete failed")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());
});

test("clicking a single used-in conversation link navigates to that chat", async () => {
  vi.mocked(listAttachments).mockResolvedValue([item({ usedIn: [{ id: "c1", title: "My chat" }] })]);
  vi.mocked(getConversation).mockResolvedValue({ id: "c1", model: "m1", turns: [], title: "My chat", createdAt: 0, updatedAt: 0 });
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("My chat")).toBeInTheDocument());

  await user.click(screen.getByText("My chat"));

  await waitFor(() => expect(useChatStore.getState().contextId).toBe("c1"));
  expect(navigate).toHaveBeenCalledWith("/c/c1");
});

test("the sort control reorders items by name", async () => {
  vi.mocked(listAttachments).mockResolvedValue([
    item({ id: "a1", originalName: "zeta.png", createdAt: 2000 }),
    item({ id: "a2", originalName: "alpha.png", createdAt: 1000 }),
  ]);
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(screen.getByText("zeta.png")).toBeInTheDocument());

  await user.selectOptions(screen.getByLabelText("Sort by"), "name");

  const names = screen.getAllByText(/\.png$/).map((el) => el.textContent);
  expect(names.indexOf("alpha.png")).toBeLessThan(names.indexOf("zeta.png"));
});
