import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../src/agent/imageGen.js", () => ({ generateImage: vi.fn() }));
vi.mock("../src/agent/embeddings.js", () => ({ embedOne: vi.fn() }));
vi.mock("../src/agent/documentSummarize.js", () => ({
  summarizeScoped: vi.fn(),
  summarizeWholeDocument: vi.fn(),
}));
vi.mock("../src/agent/documentStore.js", () => ({
  getChunksForDocument: vi.fn(),
  getDocumentRecord: vi.fn(),
  getDocumentsByIds: vi.fn(),
  listDocuments: vi.fn(),
  searchChunks: vi.fn(),
}));

import { execFile } from "node:child_process";
import { generateImage } from "../src/agent/imageGen.js";
import { embedOne } from "../src/agent/embeddings.js";
import { summarizeScoped, summarizeWholeDocument } from "../src/agent/documentSummarize.js";
import {
  getChunksForDocument,
  getDocumentRecord,
  getDocumentsByIds,
  listDocuments,
  searchChunks,
} from "../src/agent/documentStore.js";
import type { DocumentRecord, ChunkRecord } from "../src/agent/documentStore.js";
import { config } from "../src/config.js";
import { RISKY_TOOLS, getTools, webSearch } from "../src/agent/tools.js";

function findTool(name: string) {
  const t = getTools().find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

function baseDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    originalName: "a.pdf",
    mimeType: "application/pdf",
    size: 1,
    pageCount: 3,
    sizeClass: "small",
    fileStorageFilename: "a.pdf",
    fullText: "full text here",
    pageImageUrls: {},
    summary: null,
    summaryStatus: "pending",
    status: "ready",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function chunk(overrides: Partial<ChunkRecord> = {}): ChunkRecord {
  return { id: "c1", documentId: "doc-1", seq: 0, kind: "text", pageStart: 1, pageEnd: 1, text: "chunk text", imageUrl: null, ...overrides };
}

beforeEach(() => {
  vi.mocked(execFile).mockReset();
  vi.mocked(generateImage).mockReset();
  vi.mocked(embedOne).mockReset();
  vi.mocked(summarizeScoped).mockReset();
  vi.mocked(summarizeWholeDocument).mockReset();
  vi.mocked(getChunksForDocument).mockReset();
  vi.mocked(getDocumentRecord).mockReset();
  vi.mocked(getDocumentsByIds).mockReset();
  vi.mocked(listDocuments).mockReset();
  vi.mocked(searchChunks).mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("getTools exposes exactly the expected tool set, and RISKY_TOOLS names the HITL-gated ones", () => {
  const names = getTools().map((t) => t.name).sort();
  expect(names).toEqual(
    [
      "get_current_time",
      "random_number",
      "web_search",
      "send_email",
      "run_javascript",
      "generate_image",
      "search_documents",
      "summarize_document",
      "view_document_page",
    ].sort(),
  );
  expect(RISKY_TOOLS).toEqual(["send_email", "run_javascript", "generate_image"]);
});

test("get_current_time returns a valid ISO timestamp", async () => {
  const result = await findTool("get_current_time").invoke({});
  expect(new Date(result as string).toString()).not.toBe("Invalid Date");
});

test("random_number returns an integer within [min, max], swapping reversed bounds", async () => {
  const result = await findTool("random_number").invoke({ min: 5, max: 1 });
  const n = Number(result);
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(5);
});

test("send_email returns a mock confirmation without any real side effect", async () => {
  const result = await findTool("send_email").invoke({ to: "a@b.com", subject: "Hi", body: "text" });
  expect(result).toBe('Email sent to a@b.com (subject: "Hi").');
});

// --- web_search -------------------------------------------------------------

test("web_search uses Tavily when an API key is configured", async () => {
  const originalKey = config.tavilyApiKey;
  (config as { tavilyApiKey: string }).tavilyApiKey = "test-key";
  try {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: "T", url: "http://x", content: "snippet" }] }), { status: 200 }),
    );
    const result = await webSearch.invoke({ query: "cats", maxResults: 3 });
    expect(result).toContain("T");
    expect(result).toContain("http://x");
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.tavily.com/search");
  } finally {
    (config as { tavilyApiKey: string }).tavilyApiKey = originalKey;
  }
});

test("web_search falls back to DuckDuckGo when Tavily fails", async () => {
  const originalKey = config.tavilyApiKey;
  (config as { tavilyApiKey: string }).tavilyApiKey = "test-key";
  try {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("tavily")) throw new Error("tavily down");
      return new Response(
        `<a class="result__a" href="https://fallback.example">Fallback Title</a><a class="result__snippet">Fallback snippet</a>`,
        { status: 200 },
      );
    });
    const result = await webSearch.invoke({ query: "cats" });
    expect(result).toContain("Fallback Title");
  } finally {
    (config as { tavilyApiKey: string }).tavilyApiKey = originalKey;
  }
});

test("web_search parses DuckDuckGo HTML (decoding entities/redirect urls) when no Tavily key is set", async () => {
  const originalKey = config.tavilyApiKey;
  (config as { tavilyApiKey: string }).tavilyApiKey = "";
  try {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=1">Example Title &amp; More</a>` +
          `<a class="result__snippet">This is a <b>snippet</b> &#x27;quoted&#x27;</a>`,
        { status: 200 },
      ),
    );
    const result = await webSearch.invoke({ query: "anything" });
    expect(result).toContain("Example Title & More");
    expect(result).toContain("https://example.com");
    expect(result).toContain("This is a snippet 'quoted'");
  } finally {
    (config as { tavilyApiKey: string }).tavilyApiKey = originalKey;
  }
});

test("web_search reports 'No results found.' when nothing matches", async () => {
  const originalKey = config.tavilyApiKey;
  (config as { tavilyApiKey: string }).tavilyApiKey = "";
  try {
    vi.mocked(fetch).mockResolvedValue(new Response("<html></html>", { status: 200 }));
    await expect(webSearch.invoke({ query: "nothing" })).resolves.toBe("No results found.");
  } finally {
    (config as { tavilyApiKey: string }).tavilyApiKey = originalKey;
  }
});

test("web_search reports a search error message instead of throwing when everything fails", async () => {
  const originalKey = config.tavilyApiKey;
  (config as { tavilyApiKey: string }).tavilyApiKey = "";
  try {
    vi.mocked(fetch).mockRejectedValue(new Error("network unreachable"));
    const result = await webSearch.invoke({ query: "x" });
    expect(result).toMatch(/^Search error: network unreachable$/);
  } finally {
    (config as { tavilyApiKey: string }).tavilyApiKey = originalKey;
  }
});

// --- run_javascript (Deno sandbox) ------------------------------------------

function mockExecFile(err: (Error & { killed?: boolean }) | null, stdout: string, stderr: string) {
  vi.mocked(execFile).mockImplementation((..._args: unknown[]) => {
    const callback = _args[_args.length - 1] as (e: unknown, so: string, se: string) => void;
    callback(err, stdout, stderr);
    return {} as never;
  });
}

test("run_javascript rejects Python-looking code without ever spawning Deno", async () => {
  const result = await findTool("run_javascript").invoke({ code: "def foo():\n    print('hi')" });
  expect(result).toMatch(/JavaScript\/TypeScript only/);
  expect(execFile).not.toHaveBeenCalled();
});

test("run_javascript runs JS in the sandbox and returns trimmed stdout", async () => {
  mockExecFile(null, "42\n", "");
  const result = await findTool("run_javascript").invoke({ code: "console.log(42)" });
  expect(result).toBe("42");
});

test("run_javascript appends stderr output when present", async () => {
  mockExecFile(null, "", "a warning");
  const result = await findTool("run_javascript").invoke({ code: "console.warn('a warning')" });
  expect(result).toBe("[stderr]\na warning");
});

test("run_javascript reports '(no output)' when the sandbox produces nothing", async () => {
  mockExecFile(null, "", "");
  const result = await findTool("run_javascript").invoke({ code: "const x = 1;" });
  expect(result).toBe("(no output)");
});

test("run_javascript reports a timeout message when the sandbox is killed", async () => {
  const err = Object.assign(new Error("killed"), { killed: true });
  mockExecFile(err, "", "");
  const result = await findTool("run_javascript").invoke({ code: "while(true){}" });
  expect(result).toBe(`Execution timed out (${config.sandboxTimeoutMs} ms limit).`);
});

// --- generate_image ----------------------------------------------------------

test("generate_image returns the generated url + prompt as JSON", async () => {
  vi.mocked(generateImage).mockResolvedValue("http://files/gen.png");
  const result = await findTool("generate_image").invoke({ prompt: "a fox" });
  expect(JSON.parse(result as string)).toEqual({ url: "http://files/gen.png", prompt: "a fox" });
});

test("generate_image reports an error message instead of throwing", async () => {
  vi.mocked(generateImage).mockRejectedValue(new Error("ollama down"));
  const result = await findTool("generate_image").invoke({ prompt: "a fox" });
  expect(result).toBe("Image generation error: ollama down");
});

// --- search_documents ----------------------------------------------------------

test("search_documents reports no documents available when none are ready and no ids are given", async () => {
  vi.mocked(listDocuments).mockReturnValue([]);
  const result = await findTool("search_documents").invoke({ query: "q" });
  expect(result).toBe("No documents are available to search.");
});

test("search_documents reports no match when given ids don't resolve to a ready document", async () => {
  vi.mocked(getDocumentsByIds).mockReturnValue([]);
  const result = await findTool("search_documents").invoke({ query: "q", documentIds: ["missing"] });
  expect(result).toBe("None of the given document IDs match a ready document.");
});

test("search_documents returns a small document's fullText plus its figure captions", async () => {
  const doc = baseDoc({ sizeClass: "small", fullText: "the whole document" });
  vi.mocked(getDocumentsByIds).mockReturnValue([doc]);
  vi.mocked(getChunksForDocument).mockReturnValue([chunk({ kind: "figure", text: "a chart", pageStart: 2, pageEnd: 2 })]);

  const result = await findTool("search_documents").invoke({ query: "q", documentIds: ["doc-1"] });
  const hits = JSON.parse(result as string);

  expect(hits).toEqual([
    { documentId: "doc-1", documentName: "a.pdf", page: "1-3", text: "the whole document" },
    { documentId: "doc-1", documentName: "a.pdf", page: "2", text: "[Figure] a chart" },
  ]);
});

test("search_documents embeds the query and ranks chunks for a large document", async () => {
  const doc = baseDoc({ id: "doc-large", sizeClass: "large", fullText: null });
  vi.mocked(getDocumentsByIds).mockReturnValue([doc]);
  vi.mocked(embedOne).mockResolvedValue([1, 0]);
  vi.mocked(searchChunks).mockReturnValue([
    { ...chunk(), documentId: "doc-large", documentName: "a.pdf", text: "relevant text", score: 0.9, pageStart: 4, pageEnd: 4 },
  ]);

  const result = await findTool("search_documents").invoke({ query: "q", documentIds: ["doc-large"] });
  const hits = JSON.parse(result as string);

  expect(embedOne).toHaveBeenCalledWith("q");
  expect(hits).toEqual([{ documentId: "doc-large", documentName: "a.pdf", page: "4", text: "relevant text" }]);
});

test("search_documents defaults to every ready document when no ids are given", async () => {
  vi.mocked(listDocuments).mockReturnValue([
    baseDoc({ id: "ready-doc", status: "ready" }),
    baseDoc({ id: "pending-doc", status: "pending" }),
  ]);
  vi.mocked(getDocumentsByIds).mockImplementation((ids) => (ids.includes("ready-doc") ? [baseDoc({ id: "ready-doc" })] : []));
  vi.mocked(getChunksForDocument).mockReturnValue([]);

  await findTool("search_documents").invoke({ query: "q" });

  expect(getDocumentsByIds).toHaveBeenCalledWith(["ready-doc"]);
});

test("search_documents reports no relevant content when nothing is found", async () => {
  const doc = baseDoc({ sizeClass: "small", fullText: "" });
  vi.mocked(getDocumentsByIds).mockReturnValue([doc]);
  vi.mocked(getChunksForDocument).mockReturnValue([]);

  const result = await findTool("search_documents").invoke({ query: "q", documentIds: ["doc-1"] });

  // A small doc always contributes one hit for its fullText (even if empty), so this
  // exercises the "no hits at all" path only when combined with no figures/large docs.
  expect(JSON.parse(result as string)).toEqual([{ documentId: "doc-1", documentName: "a.pdf", page: "1-3", text: "" }]);
});

// --- summarize_document ----------------------------------------------------------

test("summarize_document reports not-found for an unknown id", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(null);
  const result = await findTool("summarize_document").invoke({ documentId: "nope" });
  expect(result).toBe('No document found with id "nope".');
});

test("summarize_document reports still-processing for a non-ready document", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ status: "pending" }));
  const result = await findTool("summarize_document").invoke({ documentId: "doc-1" });
  expect(result).toBe('"a.pdf" is still being processed — try again shortly.');
});

test("summarize_document returns the precomputed summary directly when ready, without recomputing", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ summaryStatus: "ready", summary: "cached summary" }));
  const result = await findTool("summarize_document").invoke({ documentId: "doc-1" });
  expect(result).toBe("cached summary");
  expect(summarizeWholeDocument).not.toHaveBeenCalled();
});

test("summarize_document computes a whole-document summary when none is cached yet", async () => {
  const doc = baseDoc({ summaryStatus: "pending", summary: null });
  vi.mocked(getDocumentRecord).mockReturnValue(doc);
  vi.mocked(summarizeWholeDocument).mockResolvedValue("fresh summary");
  const result = await findTool("summarize_document").invoke({ documentId: "doc-1" });
  expect(result).toBe("fresh summary");
  expect(summarizeWholeDocument).toHaveBeenCalledWith(doc);
});

test("summarize_document summarizes a page range via summarizeScoped, defaulting missing bounds", async () => {
  const doc = baseDoc({ pageCount: 10 });
  vi.mocked(getDocumentRecord).mockReturnValue(doc);
  vi.mocked(summarizeScoped).mockResolvedValue("scoped summary");
  const result = await findTool("summarize_document").invoke({ documentId: "doc-1", pageStart: 3 });
  expect(result).toBe("scoped summary");
  expect(summarizeScoped).toHaveBeenCalledWith(doc, 3, 10);
});

// --- view_document_page ----------------------------------------------------------

test("view_document_page reports not-found / still-processing the same way summarize_document does", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(null);
  await expect(findTool("view_document_page").invoke({ documentId: "nope", page: 1 })).resolves.toBe('No document found with id "nope".');

  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ status: "pending" }));
  await expect(findTool("view_document_page").invoke({ documentId: "doc-1", page: 1 })).resolves.toBe(
    '"a.pdf" is still being processed — try again shortly.',
  );
});

test("view_document_page returns the rendered page image url when one exists", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ pageImageUrls: { "2": "http://files/p2.png" } }));
  const result = await findTool("view_document_page").invoke({ documentId: "doc-1", page: 2 });
  expect(JSON.parse(result as string)).toEqual({ url: "http://files/p2.png", documentName: "a.pdf", page: 2 });
});

test("view_document_page falls back to text content for a page with no rendered image", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ pageImageUrls: {} }));
  vi.mocked(getChunksForDocument).mockReturnValue([chunk({ pageStart: 2, pageEnd: 2, text: "page two text" })]);
  const result = await findTool("view_document_page").invoke({ documentId: "doc-1", page: 2 });
  expect(result).toContain("No rendered image is available for page 2");
  expect(result).toContain("page two text");
});

test("view_document_page reports no content at all when there's neither an image nor text for that page", async () => {
  vi.mocked(getDocumentRecord).mockReturnValue(baseDoc({ pageImageUrls: {} }));
  vi.mocked(getChunksForDocument).mockReturnValue([]);
  const result = await findTool("view_document_page").invoke({ documentId: "doc-1", page: 9 });
  expect(result).toBe('No content found for page 9 of "a.pdf".');
});
