import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/agent/documentStore.js", () => ({ listDocuments: vi.fn() }));

import { listDocuments } from "../src/agent/documentStore.js";
import {
  backfillAttachmentsIndex,
  deleteAttachment,
  deleteAttachmentForDocument,
  deleteAttachmentsForConversation,
  getAttachment,
  listAttachments,
  syncFromTurns,
  upsertAttachment,
} from "../src/agent/attachmentsStore.js";
import { config } from "../src/config.js";

beforeEach(() => {
  vi.mocked(listDocuments).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("upsertAttachment inserts a record retrievable by id", () => {
  upsertAttachment({
    fileStorageFilename: "f1.png",
    url: "http://files/f1.png",
    originalName: "f1.png",
    mimeType: "image/png",
    size: 10,
    kind: "attachment",
  });
  const [record] = listAttachments();
  expect(record).toBeDefined();
  expect(getAttachment(record!.id)).toEqual(record);
});

test("upsertAttachment is idempotent per fileStorageFilename (ON CONFLICT DO NOTHING)", () => {
  upsertAttachment({ fileStorageFilename: "dup.png", url: "http://files/dup.png", originalName: "a", mimeType: "image/png", size: 1, kind: "attachment" });
  upsertAttachment({ fileStorageFilename: "dup.png", url: "http://files/dup.png", originalName: "b (should be ignored)", mimeType: "image/png", size: 2, kind: "attachment" });
  const matches = listAttachments().filter((r) => r.fileStorageFilename === "dup.png");
  expect(matches).toHaveLength(1);
  expect(matches[0]!.originalName).toBe("a");
});

test("listAttachments orders most-recently-created first", () => {
  upsertAttachment({ fileStorageFilename: "order-1.png", url: "u1", originalName: "1", mimeType: "image/png", size: 1, kind: "attachment", createdAt: 1000 });
  upsertAttachment({ fileStorageFilename: "order-2.png", url: "u2", originalName: "2", mimeType: "image/png", size: 1, kind: "attachment", createdAt: 2000 });
  const filenames = listAttachments().map((r) => r.fileStorageFilename);
  expect(filenames.indexOf("order-2.png")).toBeLessThan(filenames.indexOf("order-1.png"));
});

test("getAttachment returns null for an unknown id", () => {
  expect(getAttachment("nope")).toBeNull();
});

test("deleteAttachment removes a single record by id", () => {
  upsertAttachment({ fileStorageFilename: "del.png", url: "u", originalName: "d", mimeType: "image/png", size: 1, kind: "attachment" });
  const [record] = listAttachments().filter((r) => r.fileStorageFilename === "del.png");
  deleteAttachment(record!.id);
  expect(getAttachment(record!.id)).toBeNull();
});

test("deleteAttachmentsForConversation removes only that conversation's rows", () => {
  upsertAttachment({ fileStorageFilename: "conv-a.png", url: "u", originalName: "a", mimeType: "image/png", size: 1, kind: "attachment", conversationId: "conv-1" });
  upsertAttachment({ fileStorageFilename: "conv-b.png", url: "u", originalName: "b", mimeType: "image/png", size: 1, kind: "attachment", conversationId: "conv-2" });
  deleteAttachmentsForConversation("conv-1");
  const remaining = listAttachments().map((r) => r.fileStorageFilename);
  expect(remaining).not.toContain("conv-a.png");
  expect(remaining).toContain("conv-b.png");
});

test("deleteAttachmentForDocument removes only that document's rows", () => {
  upsertAttachment({ fileStorageFilename: "doc-a.png", url: "u", originalName: "a", mimeType: "application/pdf", size: 1, kind: "document", documentId: "doc-1" });
  upsertAttachment({ fileStorageFilename: "doc-b.png", url: "u", originalName: "b", mimeType: "application/pdf", size: 1, kind: "document", documentId: "doc-2" });
  deleteAttachmentForDocument("doc-1");
  const remaining = listAttachments().map((r) => r.fileStorageFilename);
  expect(remaining).not.toContain("doc-a.png");
  expect(remaining).toContain("doc-b.png");
});

test("syncFromTurns indexes a user turn's URL attachments, skipping string/URL-less legacy entries", () => {
  syncFromTurns("conv-sync-1", [
    {
      role: "user",
      attachments: [
        { name: "photo.png", url: "http://files/photo.png", mimeType: "image/png", size: 42 },
        "legacy-string-entry",
        { name: "no-url" }, // no url/mimeType: skipped
      ],
    },
  ]);
  const records = listAttachments().filter((r) => r.conversationId === "conv-sync-1");
  expect(records).toHaveLength(1);
  expect(records[0]!.originalName).toBe("photo.png");
  expect(records[0]!.kind).toBe("attachment");
});

test("syncFromTurns indexes a completed generate_image tool call as a generated-image attachment", () => {
  syncFromTurns("conv-sync-2", [
    {
      role: "agent",
      tools: [
        { name: "generate_image", status: "completed", output: JSON.stringify({ url: "http://files/gen.png", prompt: "a fox in snow" }) },
        { name: "generate_image", status: "started", output: undefined }, // not completed: skipped
        { name: "search_documents", status: "completed", output: "irrelevant" }, // wrong tool: skipped
      ],
    },
  ]);
  const records = listAttachments().filter((r) => r.conversationId === "conv-sync-2");
  expect(records).toHaveLength(1);
  expect(records[0]!.kind).toBe("generated-image");
  expect(records[0]!.originalName).toBe("a fox in snow.png");
});

test("syncFromTurns ignores a generate_image output that isn't valid JSON with a url", () => {
  syncFromTurns("conv-sync-3", [
    { role: "agent", tools: [{ name: "generate_image", status: "completed", output: "not json" }] },
  ]);
  expect(listAttachments().filter((r) => r.conversationId === "conv-sync-3")).toHaveLength(0);
});

test("syncFromTurns is idempotent when re-run on a growing conversation", () => {
  const turns = [{ role: "user" as const, attachments: [{ name: "x.png", url: "http://files/x.png", mimeType: "image/png", size: 1 }] }];
  syncFromTurns("conv-sync-4", turns);
  syncFromTurns("conv-sync-4", turns);
  expect(listAttachments().filter((r) => r.conversationId === "conv-sync-4")).toHaveLength(1);
});

test("backfillAttachmentsIndex indexes every document from documentStore.listDocuments", () => {
  vi.mocked(listDocuments).mockReturnValue([
    {
      id: "doc-backfill-1",
      originalName: "report.pdf",
      mimeType: "application/pdf",
      size: 123,
      fileStorageFilename: "report-stored.pdf",
      createdAt: 555,
    } as never,
  ]);

  backfillAttachmentsIndex();

  const record = listAttachments().find((r) => r.documentId === "doc-backfill-1");
  expect(record).toBeDefined();
  expect(record!.url).toBe(`${config.fileStorageBaseUrl}/files/report-stored.pdf`);
  expect(record!.kind).toBe("document");
});
