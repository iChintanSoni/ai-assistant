/**
 * Built-in tools for the general assistant.
 *
 * - get_current_time / random_number: trivial demos of tool-call streaming.
 * - web_search: keyless DuckDuckGo search (safe, auto-approved).
 * - send_email: mock side-effect, gated behind human approval (HITL).
 * - run_code: JS/TS in a sandboxed Deno runtime (no fs/net/env), gated behind approval.
 * - generate_image: Ollama image generation (x/z-image-turbo), gated behind approval.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../config.js";
import { generateImage } from "./imageGen.js";
import { embedOne } from "./embeddings.js";
import { summarizeScoped, summarizeWholeDocument } from "./documentSummarize.js";
import {
  type SearchResult as DocumentSearchResult,
  getChunksForDocument,
  getDocumentRecord,
  getDocumentsByIds,
  listDocuments,
  searchChunks,
} from "./documentStore.js";

const getCurrentTime = tool(
  async () => new Date().toISOString(),
  {
    name: "get_current_time",
    description: "Get the current date and time as an ISO 8601 string.",
    schema: z.object({}),
  },
);

const randomNumber = tool(
  async ({ min, max }) => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
  },
  {
    name: "random_number",
    description: "Return a random integer between min and max (inclusive).",
    schema: z.object({
      min: z.number().describe("Lower bound (inclusive)"),
      max: z.number().describe("Upper bound (inclusive)"),
    }),
  },
);

// ---------------------------------------------------------------------------
// web_search (keyless DuckDuckGo)
// ---------------------------------------------------------------------------

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function decodeDdgUrl(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fall through */
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

function parseDuckDuckGo(html: string): Array<{ title: string; url: string; snippet: string }> {
  const titleRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const titles: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null) titles.push({ url: decodeDdgUrl(m[1]!), title: stripHtml(m[2]!) });
  while ((m = snippetRe.exec(html)) !== null) snippets.push(stripHtml(m[1]!));
  return titles.map((t, i) => ({ title: t.title, url: t.url, snippet: snippets[i] ?? "" }));
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function tavilySearch(query: string, n: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${config.tavilyApiKey}` },
    body: JSON.stringify({ query, max_results: n, search_depth: "basic", include_answer: false }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "" }));
}

async function duckDuckGoSearch(query: string, n: number): Promise<SearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)" },
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  return parseDuckDuckGo(await res.text()).slice(0, n);
}

export const webSearch = tool(
  async ({ query, maxResults }) => {
    const n = Math.min(Math.max(maxResults ?? 5, 1), 8);
    try {
      let results: SearchResult[];
      if (config.tavilyApiKey) {
        try {
          results = await tavilySearch(query, n);
        } catch {
          results = await duckDuckGoSearch(query, n); // fall back if Tavily is unavailable
        }
      } else {
        results = await duckDuckGoSearch(query, n);
      }
      results = results.slice(0, n);
      if (results.length === 0) return "No results found.";
      return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "web_search",
    description: "Search the web and return a list of results with title, URL, and snippet.",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().describe("How many results (1-8, default 5)"),
    }),
  },
);

// ---------------------------------------------------------------------------
// send_email (mock, HITL-gated)
// ---------------------------------------------------------------------------

const sendEmail = tool(
  async ({ to, subject }) => `Email sent to ${to} (subject: "${subject}").`,
  {
    name: "send_email",
    description: "Send an email to a recipient. Requires human approval before sending.",
    schema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text"),
    }),
  },
);

// ---------------------------------------------------------------------------
// run_code (sandboxed Deno, HITL-gated)
// ---------------------------------------------------------------------------

async function runInDenoSandbox(code: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aurora-code-"));
  const file = path.join(dir, "main.ts");
  await writeFile(file, code, "utf8");
  try {
    return await new Promise<string>((resolve) => {
      // No --allow-* flags => Deno denies filesystem / network / env access.
      execFile(
        config.denoPath,
        ["run", "--quiet", file],
        { timeout: config.sandboxTimeoutMs, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            resolve(`Execution timed out (${config.sandboxTimeoutMs} ms limit).`);
            return;
          }
          const out = (stdout || "").trim();
          const errOut = (stderr || "").trim();
          if (errOut) resolve(`${out}\n[stderr]\n${errOut}`.trim());
          else resolve(out || "(no output)");
        },
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function looksLikePython(code: string): boolean {
  const pythonish = /(^|\n)\s*(def |from \w+ import |import \w+\s*$|print\s*\()/.test(code);
  const jsish = /console\.\w+|=>|\b(const|let|var|function)\b/.test(code);
  return pythonish && !jsish;
}

const runCode = tool(
  async ({ code }) => {
    if (looksLikePython(code)) {
      return "This sandbox runs JavaScript/TypeScript only (via Deno), not Python. Please rewrite the code in JavaScript and print results with console.log().";
    }
    return runInDenoSandbox(code);
  },
  {
    name: "run_javascript",
    description:
      "Run JavaScript or TypeScript in a sandboxed Deno runtime with NO filesystem, network, or environment access. This executes JavaScript/TypeScript ONLY — never Python. Print results with console.log(). Requires human approval before running.",
    schema: z.object({
      code: z.string().describe("JavaScript or TypeScript source. Print output with console.log()."),
    }),
  },
);

// ---------------------------------------------------------------------------
// generate_image (Ollama CLI, HITL-gated)
// ---------------------------------------------------------------------------

const generateImageTool = tool(
  async ({ prompt, width, height, negativePrompt, seed }) => {
    try {
      const url = await generateImage({ prompt, width, height, negativePrompt, seed });
      return JSON.stringify({ url, prompt });
    } catch (err) {
      return `Image generation error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using a local image-generation model. Requires human approval before running.",
    schema: z.object({
      prompt: z.string().describe("What to draw, in natural language"),
      width: z.number().optional().describe("Image width in pixels"),
      height: z.number().optional().describe("Image height in pixels"),
      negativePrompt: z.string().optional().describe("Things to avoid in the image"),
      seed: z.number().optional().describe("Random seed, for reproducible results"),
    }),
  },
);

// ---------------------------------------------------------------------------
// search_documents / summarize_document (uploaded document library, read-only)
// ---------------------------------------------------------------------------

interface DocSearchHit {
  documentId: string;
  documentName: string;
  page: string;
  text: string;
}

function pageLabel(pageStart: number, pageEnd: number): string {
  return pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`;
}

const searchDocuments = tool(
  async ({ query, documentIds }) => {
    const ids =
      documentIds && documentIds.length > 0
        ? documentIds
        : listDocuments()
            .filter((d) => d.status === "ready")
            .map((d) => d.id);
    if (ids.length === 0) return "No documents are available to search.";

    const docs = getDocumentsByIds(ids).filter((d) => d.status === "ready");
    if (docs.length === 0) return "None of the given document IDs match a ready document.";

    const hits: DocSearchHit[] = [];

    const smallDocs = docs.filter((d) => d.sizeClass === "small");
    for (const d of smallDocs) {
      hits.push({ documentId: d.id, documentName: d.originalName, page: `1-${d.pageCount}`, text: d.fullText ?? "" });
      // Figures aren't part of the extracted body text, so a small doc's full-text
      // dump above won't mention them — surface their captions explicitly too.
      for (const fig of getChunksForDocument(d.id).filter((c) => c.kind === "figure")) {
        hits.push({ documentId: d.id, documentName: d.originalName, page: pageLabel(fig.pageStart, fig.pageEnd), text: `[Figure] ${fig.text}` });
      }
    }

    const largeDocIds = docs.filter((d) => d.sizeClass === "large").map((d) => d.id);
    if (largeDocIds.length > 0) {
      const queryVector = await embedOne(query);
      const results: DocumentSearchResult[] = searchChunks(largeDocIds, queryVector, 5);
      for (const r of results) {
        hits.push({ documentId: r.documentId, documentName: r.documentName, page: pageLabel(r.pageStart, r.pageEnd), text: r.text });
      }
    }

    if (hits.length === 0) return "No relevant content found.";
    return JSON.stringify(hits);
  },
  {
    name: "search_documents",
    description:
      "Search the user's uploaded documents for content relevant to a question. Returns excerpts with " +
      "the source document name and page number(s) — cite them when you answer. Use this for specific " +
      "questions ('what does X say about Y'); use summarize_document instead for overview/summary requests.",
    schema: z.object({
      query: z.string().describe("What to search for"),
      documentIds: z
        .array(z.string())
        .optional()
        .describe("Specific document IDs to search. Omit to search across all uploaded documents."),
    }),
  },
);

const summarizeDocument = tool(
  async ({ documentId, pageStart, pageEnd }) => {
    const doc = getDocumentRecord(documentId);
    if (!doc) return `No document found with id "${documentId}".`;
    if (doc.status !== "ready") return `"${doc.originalName}" is still being processed — try again shortly.`;

    if (pageStart === undefined && pageEnd === undefined) {
      if (doc.summaryStatus === "ready" && doc.summary) return doc.summary;
      return summarizeWholeDocument(doc);
    }
    return summarizeScoped(doc, pageStart ?? 1, pageEnd ?? doc.pageCount);
  },
  {
    name: "summarize_document",
    description:
      "Summarize a document, or a specific page range within it (e.g. one chapter/section). Use this " +
      "instead of search_documents when the user wants an overview rather than an answer to a specific " +
      "question — search_documents finds relevant snippets, this produces coherent coverage of the whole " +
      "requested scope.",
    schema: z.object({
      documentId: z.string().describe("The document to summarize"),
      pageStart: z.number().int().optional().describe("First page of the range to summarize; omit for the whole document"),
      pageEnd: z.number().int().optional().describe("Last page of the range to summarize; omit for the whole document"),
    }),
  },
);

const viewDocumentPage = tool(
  async ({ documentId, page }) => {
    const doc = getDocumentRecord(documentId);
    if (!doc) return `No document found with id "${documentId}".`;
    if (doc.status !== "ready") return `"${doc.originalName}" is still being processed — try again shortly.`;

    const imageUrl = doc.pageImageUrls[String(page)];
    if (imageUrl) return JSON.stringify({ url: imageUrl, documentName: doc.originalName, page });

    const text = getChunksForDocument(documentId)
      .filter((c) => c.pageStart <= page && c.pageEnd >= page)
      .map((c) => c.text)
      .join("\n\n");
    return text
      ? `No rendered image is available for page ${page} of "${doc.originalName}" (no figure was detected there). Its text content:\n\n${text}`
      : `No content found for page ${page} of "${doc.originalName}".`;
  },
  {
    name: "view_document_page",
    description:
      "Show the user the rendered image of a specific document page — use this when they ask to see or " +
      "be shown a figure/chart/diagram directly, after search_documents or summarize_document has told you " +
      "which page it's on. The UI displays the actual image to the user directly; you cannot see the image " +
      "yourself, only whether one was found, so don't claim to describe visual detail beyond what " +
      "search_documents' figure caption already told you.",
    schema: z.object({
      documentId: z.string().describe("The document to view a page from"),
      page: z.number().int().describe("The page number to view"),
    }),
  },
);

export function getTools() {
  return [
    getCurrentTime,
    randomNumber,
    webSearch,
    sendEmail,
    runCode,
    generateImageTool,
    searchDocuments,
    summarizeDocument,
    viewDocumentPage,
  ];
}

/** Tools that must not run without explicit user approval. */
export const RISKY_TOOLS = ["send_email", "run_javascript", "generate_image"] as const;
