/**
 * First-party MCP server: document + diagram generation (docx/pptx/pdf/xlsx/
 * csv/txt, and a drawio diagram). This is the "write a first-party MCP
 * server" tier of the capability architecture (see docs/architecture.md) —
 * a standalone process spoken to over stdio, registered in
 * apps/agent/config/mcp-servers.json rather than wired into the agent's own
 * code. Each tool builds file content via builders.ts (kept separate and
 * pure so it's unit-testable), writes it to a temp file, uploads it to
 * file-storage via the shared helper (packages/shared-node), and returns
 * { url, filename }.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { uploadToFileStorage } from "@ai-assistant/shared-node";
import {
  buildCsv,
  buildDocxBuffer,
  buildDrawioXml,
  buildPdfBuffer,
  buildPptxBuffer,
  buildXlsxBuffer,
  safeOutputFilename,
  slugify,
} from "./builders.js";

const FILE_STORAGE_BASE_URL = process.env.FILE_STORAGE_BASE_URL ?? "http://localhost:6060";

/** Writes `content` to a temp file, uploads it, and cleans up — the shared shape every tool below follows. */
async function uploadContent(
  filename: string,
  mimeType: string,
  content: Buffer | string,
): Promise<{ url: string; filename: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "mcp-authoring-"));
  const safeFilename = safeOutputFilename(filename);
  const filePath = path.join(dir, safeFilename);
  try {
    await writeFile(filePath, content);
    const url = await uploadToFileStorage(filePath, FILE_STORAGE_BASE_URL, mimeType);
    return { url, filename: safeFilename };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function textResult(json: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(json) }] };
}

function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

const server = new McpServer({ name: "authoring", version: "1.0.0" });

server.registerTool(
  "create_docx",
  {
    title: "Create a Word document",
    description:
      "Create a downloadable Word (.docx) document from a title and an ordered list of sections, each " +
      "an optional heading plus body paragraphs. Returns { url, filename }.",
    inputSchema: {
      title: z.string().describe("Document title (also the default filename)"),
      sections: z
        .array(
          z.object({
            heading: z.string().optional().describe("Section heading; omit for an unheaded section"),
            paragraphs: z.array(z.string()).describe("Body paragraphs in this section"),
          }),
        )
        .describe("The document's sections, in order"),
      filename: z.string().optional().describe("Filename without extension; defaults to a slug of the title"),
    },
  },
  async ({ title, sections, filename }) => {
    try {
      const buffer = await buildDocxBuffer(title, sections);
      const result = await uploadContent(
        `${filename ?? slugify(title)}.docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer,
      );
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_pptx",
  {
    title: "Create a PowerPoint presentation",
    description:
      "Create a downloadable PowerPoint (.pptx) presentation from a title slide and an ordered list of " +
      "content slides, each with its own title and bullet points. Returns { url, filename }.",
    inputSchema: {
      title: z.string().describe("Presentation title (title-slide text and the default filename)"),
      slides: z
        .array(
          z.object({
            title: z.string().describe("This slide's title"),
            bullets: z.array(z.string()).describe("This slide's bullet points"),
          }),
        )
        .describe("Content slides, in order, after the title slide"),
      filename: z.string().optional().describe("Filename without extension; defaults to a slug of the title"),
    },
  },
  async ({ title, slides, filename }) => {
    try {
      const buffer = await buildPptxBuffer(title, slides);
      const result = await uploadContent(
        `${filename ?? slugify(title)}.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer,
      );
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_pdf",
  {
    title: "Create a PDF document",
    description: "Create a downloadable PDF from a title and an ordered list of body paragraphs. Returns { url, filename }.",
    inputSchema: {
      title: z.string().describe("Document title (also the default filename)"),
      paragraphs: z.array(z.string()).describe("Body paragraphs, in order"),
      filename: z.string().optional().describe("Filename without extension; defaults to a slug of the title"),
    },
  },
  async ({ title, paragraphs, filename }) => {
    try {
      const buffer = await buildPdfBuffer(title, paragraphs);
      const result = await uploadContent(`${filename ?? slugify(title)}.pdf`, "application/pdf", buffer);
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_xlsx",
  {
    title: "Create an Excel workbook",
    description:
      "Create a downloadable Excel (.xlsx) workbook from one or more named sheets, each a grid of string " +
      "rows/cells. Returns { url, filename }.",
    inputSchema: {
      filename: z.string().describe("Filename without extension"),
      sheets: z
        .array(
          z.object({
            name: z.string().describe("Sheet name/tab title"),
            rows: z.array(z.array(z.string())).describe("Rows of cell values, in order"),
          }),
        )
        .describe("One or more sheets"),
    },
  },
  async ({ filename, sheets }) => {
    try {
      const buffer = await buildXlsxBuffer(sheets);
      const result = await uploadContent(
        `${filename}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      );
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_csv",
  {
    title: "Create a CSV file",
    description: "Create a downloadable CSV file from a grid of string rows/cells. Returns { url, filename }.",
    inputSchema: {
      filename: z.string().describe("Filename without extension"),
      rows: z.array(z.array(z.string())).describe("Rows of cell values, in order (first row is typically the header)"),
    },
  },
  async ({ filename, rows }) => {
    try {
      const result = await uploadContent(`${filename}.csv`, "text/csv", buildCsv(rows));
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_txt",
  {
    title: "Create a plain text file",
    description: "Create a downloadable plain-text (.txt) file with the given content. Returns { url, filename }.",
    inputSchema: {
      filename: z.string().describe("Filename without extension"),
      content: z.string().describe("The file's full text content"),
    },
  },
  async ({ filename, content }) => {
    try {
      const result = await uploadContent(`${filename}.txt`, "text/plain", content);
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_drawio_diagram",
  {
    title: "Create a draw.io diagram",
    description:
      "Create a downloadable draw.io (.drawio) diagram from a list of labeled nodes and the edges " +
      "connecting them. Opens directly in draw.io / diagrams.net. Position (x/y) is optional — nodes " +
      "without one are auto-arranged in a grid. Returns { url, filename }.",
    inputSchema: {
      filename: z.string().describe("Filename without extension"),
      nodes: z
        .array(
          z.object({
            id: z.string().describe("Unique id for this node, referenced by edges' from/to"),
            label: z.string().describe("Text shown inside the node"),
            x: z.number().optional().describe("X position in pixels; omit to auto-arrange"),
            y: z.number().optional().describe("Y position in pixels; omit to auto-arrange"),
            width: z.number().optional().describe("Node width in pixels; defaults to 140"),
            height: z.number().optional().describe("Node height in pixels; defaults to 60"),
          }),
        )
        .describe("The diagram's boxes/shapes"),
      edges: z
        .array(
          z.object({
            from: z.string().describe("Source node id"),
            to: z.string().describe("Target node id"),
            label: z.string().optional().describe("Text shown on the connecting line"),
          }),
        )
        .describe("Arrows connecting nodes, by id"),
    },
  },
  async ({ filename, nodes, edges }) => {
    try {
      const xml = buildDrawioXml(nodes, edges);
      // "text/xml" (not "application/xml"): file-storage only trusts a client-declared
      // mimetype for text content when it's prefixed "text/" (XML has no reliable magic
      // bytes to sniff otherwise) — same path .csv/.txt already go through.
      const result = await uploadContent(`${filename}.drawio`, "text/xml", xml);
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("mcp-authoring fatal error:", err);
  process.exit(1);
});
