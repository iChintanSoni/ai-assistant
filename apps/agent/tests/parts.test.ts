import { expect, test, vi } from "vitest";
import { Role, type Message, type Part } from "@a2a-js/sdk";
import {
  extractDocumentIds,
  extractModel,
  prependNote,
  toLangChainContent,
  validateParts,
} from "../src/agent/parts.js";

function message(overrides: Partial<Message> = {}): Message {
  return {
    messageId: "m1",
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
    ...overrides,
  };
}

function textPart(text: string): Part {
  return { content: { $case: "text", value: text }, metadata: undefined, filename: "", mediaType: "text/plain" };
}

function dataPart(data: unknown): Part {
  return { content: { $case: "data", value: data }, metadata: undefined, filename: "", mediaType: "application/json" };
}

/** Inline file bytes, mirroring how a peer agent might send a file directly (this app's own uploads always use `urlFilePart`). */
function rawFilePart(mediaType: string, base64: string): Part {
  return { content: { $case: "raw", value: Buffer.from(base64, "base64") }, metadata: undefined, filename: "", mediaType };
}

function urlFilePart(mediaType: string, url: string): Part {
  return { content: { $case: "url", value: url }, metadata: undefined, filename: "", mediaType };
}

test("extractModel reads metadata.model when it's a non-empty string", () => {
  expect(extractModel(message({ metadata: { model: "gemma4:12b" } }))).toBe("gemma4:12b");
});

test("extractModel returns undefined for missing, empty, or non-string metadata.model", () => {
  expect(extractModel(message())).toBeUndefined();
  expect(extractModel(message({ metadata: { model: "" } }))).toBeUndefined();
  expect(extractModel(message({ metadata: { model: 42 } }))).toBeUndefined();
});

test("extractDocumentIds filters metadata.documentIds down to strings", () => {
  expect(extractDocumentIds(message({ metadata: { documentIds: ["a", "b", 1, null] } }))).toEqual(["a", "b"]);
});

test("extractDocumentIds returns [] when metadata.documentIds is missing or not an array", () => {
  expect(extractDocumentIds(message())).toEqual([]);
  expect(extractDocumentIds(message({ metadata: { documentIds: "not-an-array" } }))).toEqual([]);
});

test("validateParts rejects an image part when the model can't see images", () => {
  const parts: Part[] = [rawFilePart("image/png", "abc")];
  expect(validateParts(parts, ["text"])).toMatch(/can't read images/);
});

test("validateParts rejects an audio part when the model can't hear audio", () => {
  const parts: Part[] = [rawFilePart("audio/wav", "abc")];
  expect(validateParts(parts, ["text", "image"])).toMatch(/can't process audio/);
});

test("validateParts allows image/audio parts when the model supports them, and ignores non-file parts", () => {
  const parts: Part[] = [textPart("hi"), rawFilePart("image/png", "abc"), rawFilePart("audio/wav", "abc")];
  expect(validateParts(parts, ["text", "image", "audio"])).toBeNull();
});

test("prependNote prefixes a plain-string content with the note + blank line", () => {
  expect(prependNote("body", "note")).toBe("note\n\nbody");
});

test("prependNote unshifts a text block onto array content", () => {
  const content = [{ type: "text" as const, text: "body" }];
  expect(prependNote(content, "note")).toEqual([{ type: "text", text: "note" }, { type: "text", text: "body" }]);
});

test("toLangChainContent collapses a single text part to a plain string", async () => {
  const parts: Part[] = [textPart("hello")];
  await expect(toLangChainContent(parts)).resolves.toBe("hello");
});

test("toLangChainContent renders a lone data part as a fenced JSON block (collapsed to a plain string)", async () => {
  const parts: Part[] = [dataPart({ type: "decision", decisions: [{ type: "approve" }] })];
  const result = await toLangChainContent(parts);
  expect(result).toBe(
    '```json\n' + JSON.stringify({ type: "decision", decisions: [{ type: "approve" }] }, null, 2) + '\n```',
  );
});

test("toLangChainContent keeps multiple blocks as an array instead of collapsing", async () => {
  const parts: Part[] = [textPart("hello"), dataPart({ foo: "bar" })];
  const result = await toLangChainContent(parts);
  expect(Array.isArray(result)).toBe(true);
  expect((result as { type: string }[]).map((b) => b.type)).toEqual(["text", "text"]);
});

test("toLangChainContent turns an image-only message into an image block", async () => {
  const parts: Part[] = [rawFilePart("image/png", "QUJD")];
  const result = await toLangChainContent(parts);
  expect(result).toEqual([{ type: "image_url", image_url: "data:image/png;base64,QUJD" }]);
});

test("toLangChainContent fetches a url file part and inlines it as base64", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
    ),
  );
  const parts: Part[] = [urlFilePart("image/png", "http://files/1.png")];
  const result = await toLangChainContent(parts);
  expect(result).toEqual([{ type: "image_url", image_url: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}` }]);
  vi.unstubAllGlobals();
});

test("toLangChainContent throws when fetching a url file part fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  const parts: Part[] = [urlFilePart("image/png", "http://files/missing.png")];
  await expect(toLangChainContent(parts)).rejects.toThrow(/HTTP 404/);
  vi.unstubAllGlobals();
});
