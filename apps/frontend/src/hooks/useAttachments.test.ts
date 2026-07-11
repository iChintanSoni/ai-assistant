import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("../lib/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/documents")>();
  return { ...actual, registerDocument: vi.fn() };
});

import { uploadFile } from "../lib/upload";
import { registerDocument } from "../lib/documents";
import { useChatStore } from "../store/chat";
import { useAttachments } from "./useAttachments";
import type { ModelInfo } from "../lib/models";

function textModel(): ModelInfo {
  return { name: "text-only", modalities: ["text"], tools: true, thinking: false, contextLength: null };
}
function visionModel(): ModelInfo {
  return { name: "vision", modalities: ["text", "image"], tools: true, thinking: false, contextLength: null };
}

beforeEach(() => {
  vi.mocked(uploadFile).mockReset();
  vi.mocked(registerDocument).mockReset();
  useChatStore.setState({ models: [textModel()], selectedModel: "text-only", activeDocumentIds: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("classifies an image as a direct attachment when the selected model has vision", () => {
  useChatStore.setState({ models: [visionModel()], selectedModel: "vision" });
  const { result } = renderHook(() => useAttachments());
  const image = new File(["x"], "a.png", { type: "image/png" });

  act(() => result.current.addFiles([image]));

  expect(result.current.attachments).toHaveLength(1);
  expect(result.current.attachments[0]!.file).toBe(image);
  expect(registerDocument).not.toHaveBeenCalled();
});

test("routes a document extension through document upload+registration, not local staging", async () => {
  vi.mocked(uploadFile).mockResolvedValue({ url: "http://files/a.pdf", filename: "a.pdf", size: 1, mimetype: "application/pdf" });
  vi.mocked(registerDocument).mockResolvedValue({
    id: "doc-1",
    originalName: "a.pdf",
    mimeType: "application/pdf",
    size: 1,
    pageCount: 0,
    sizeClass: "pending",
    summary: null,
    summaryStatus: "pending",
    status: "pending",
    error: null,
    createdAt: 0,
    updatedAt: 0,
  });
  const { result } = renderHook(() => useAttachments());
  const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });

  act(() => result.current.addFiles([pdf]));

  await waitFor(() => expect(useChatStore.getState().activeDocumentIds).toEqual(["doc-1"]));
  expect(result.current.attachments).toHaveLength(0);
});

test("shows a notice and skips registration when a document upload fails", async () => {
  vi.mocked(uploadFile).mockRejectedValue(new Error("upload failed"));
  const { result } = renderHook(() => useAttachments());
  act(() => result.current.addFiles([new File(["x"], "a.pdf", { type: "application/pdf" })]));

  await waitFor(() => expect(result.current.notice).toBe("upload failed"));
  expect(registerDocument).not.toHaveBeenCalled();
});

test("flags a legacy Office file with a dedicated message instead of uploading it", () => {
  const { result } = renderHook(() => useAttachments());
  act(() => result.current.addFiles([new File(["x"], "old.doc")]));
  expect(result.current.notice).toMatch(/old Word\/Excel\/PowerPoint format/);
  expect(result.current.attachments).toHaveLength(0);
});

test("flags a genuinely unsupported file", () => {
  const { result } = renderHook(() => useAttachments());
  act(() => result.current.addFiles([new File(["x"], "song.mp3", { type: "audio/mpeg" })]));
  expect(result.current.notice).toMatch(/isn't a supported file type/);
});

test("caps accepted files at MAX_ATTACHMENTS and reports the overflow", () => {
  useChatStore.setState({ models: [visionModel()], selectedModel: "vision", activeDocumentIds: ["d1", "d2", "d3", "d4"] });
  const { result } = renderHook(() => useAttachments());
  const images = [1, 2].map((i) => new File(["x"], `${i}.png`, { type: "image/png" }));

  act(() => result.current.addFiles(images));

  expect(result.current.attachments).toHaveLength(1); // only 1 slot left (5 max - 4 active)
  expect(result.current.notice).toMatch(/Only 5 files can be attached/);
});

test("removeAttachment removes only the targeted staged attachment", () => {
  useChatStore.setState({ models: [visionModel()], selectedModel: "vision" });
  const { result } = renderHook(() => useAttachments());
  const a = new File(["x"], "a.png", { type: "image/png" });
  const b = new File(["x"], "b.png", { type: "image/png" });
  act(() => result.current.addFiles([a, b]));

  act(() => result.current.removeAttachment(0));

  expect(result.current.attachments.map((x) => x.file)).toEqual([b]);
});

test("clear empties staged attachments and any notice", () => {
  useChatStore.setState({ models: [visionModel()], selectedModel: "vision" });
  const { result } = renderHook(() => useAttachments());
  act(() => result.current.addFiles([new File(["x"], "a.png", { type: "image/png" }), new File(["x"], "bad.xyz")]));
  expect(result.current.notice).not.toBeNull();

  act(() => result.current.clear());

  expect(result.current.attachments).toHaveLength(0);
  expect(result.current.notice).toBeNull();
});
