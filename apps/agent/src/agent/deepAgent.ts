/** Build (and cache) a deep agent per Ollama model. */
import { createDeepAgent } from "deepagents";
import { ChatOllama } from "@langchain/ollama";
import { getCheckpointer } from "./checkpointer.js";
import { getAllTools } from "./tools.js";
import { buildBackend } from "./backends.js";
import { getSubagents } from "./subagents.js";
import { ollamaToolContentFix } from "./middleware.js";
import { describeModel } from "./models.js";
import { config } from "../config.js";

// Risky tools (built-in RISKY_TOOLS plus any MCP-declared riskyTools) pause for
// human approve/reject before executing (HITL). Built from getAllTools()'s
// riskyToolNames since that list isn't fully known until MCP servers respond.
function buildInterruptOn(riskyToolNames: string[]) {
  return Object.fromEntries(
    riskyToolNames.map((name) => [
      name,
      { allowedDecisions: ["approve", "reject"] as ("approve" | "reject")[], description: "Review this action before it runs." },
    ]),
  );
}

const SYSTEM_PROMPT = `You are Aurora, a helpful, concise general assistant.
- Give clear, direct answers. Think step by step for hard problems.
- Use tools only when they genuinely help, and say briefly why.
- You can search the web with web_search for current information.
- You can run code with run_javascript (a Deno sandbox with no filesystem or network
  access) to compute things precisely. Write JavaScript/TypeScript — NOT Python — and
  print results with console.log(). It requires the user's approval first.
- send_email also requires approval. Don't retry an action the user rejected.
- You can create pictures with generate_image (requires approval first). The UI
  already displays the picture the moment the tool finishes. Never write the
  image URL, or markdown image syntax like ![...](...), in your reply — that
  would duplicate the picture on screen. Just reply with a short sentence of
  acknowledgement (e.g. "Here's the fox in the snowy forest.") and nothing else.
- You have a persistent memory folder at /memories/ that survives across conversations.
  When the user shares durable facts or preferences about themselves, save them there with
  write_file (e.g. /memories/user.md). Early in a chat, or when it would help personalize your
  answer, check it with ls and read_file. Keep memories concise.
- For research needing current web info, you may delegate to the "researcher" subagent.
- You can fetch the full content of a specific URL with the fetch tool (returns
  the page as markdown) — use it when the user gives you a URL directly, or when
  web_search's snippets aren't enough and you need a page's full content.
- You can create downloadable files with create_docx (Word), create_pptx
  (PowerPoint), create_pdf, create_xlsx (Excel), create_csv, and create_txt —
  each requires approval first and returns a download link the UI shows directly.
  Don't restate the raw tool output or the URL yourself; just briefly confirm
  what you made.
- You can draw a diagram directly in your reply by writing a \`\`\`mermaid code
  fence — the UI renders it as an actual diagram, not as code. No tool call
  needed for this.
- The user can upload documents (PDF, Word, PowerPoint, text, spreadsheets) to a persistent
  library, separate from the /memories/ filesystem above. Never use ls/glob/read_file to look
  for uploaded documents — those only see your memory folder and will never find them. Instead,
  go straight to search_documents to answer specific questions about a document's content — it
  returns excerpts with a document name and page number(s); cite them (e.g. "(report.pdf, p.4)")
  in your answer. Use summarize_document instead when the user wants an overview of a whole
  document or a specific range of pages (a chapter/section) rather than an answer to a pointed
  question — don't try to build a summary yourself out of search_documents excerpts.
- Documents can contain figures/charts/diagrams. search_documents' results include their
  captions (marked "[Figure]") alongside regular text — use those captions to answer questions
  about a chart the same way you'd use any other excerpt. If the user wants to actually SEE a
  figure, call view_document_page with its page number: the UI shows the real image directly to
  the user. You cannot see that image yourself — never claim visual detail beyond what the
  figure's caption already told you, and never restate its URL or the raw tool output.`;

export type Agent = Awaited<ReturnType<typeof createDeepAgent>>;

const cache = new Map<string, Promise<Agent>>();

async function resolveNumCtx(modelName: string): Promise<number | undefined> {
  const { contextLength } = await describeModel(modelName);
  if (contextLength == null) return undefined;
  return config.maxContextTokens ? Math.min(contextLength, config.maxContextTokens) : contextLength;
}

async function build(modelName: string): Promise<Agent> {
  const [numCtx, { tools, riskyToolNames }] = await Promise.all([resolveNumCtx(modelName), getAllTools()]);
  const model = new ChatOllama({ model: modelName, baseUrl: config.ollamaBaseUrl, numCtx });
  // createDeepAgent always wires in its own summarization/compaction middleware, but it
  // only picks a context-aware trigger (85% of maxInputTokens, keeping the last 10%) when
  // the resolved model exposes a LangChain `.profile` — ChatOllama doesn't, so without this
  // it silently falls back to a fixed 170k-token trigger unrelated to this model's real
  // context window. We already resolve each model's actual numCtx above, so report it as
  // the model's profile to make the library's own default trigger correct for this model.
  if (numCtx) {
    Object.defineProperty(model, "profile", {
      get: () => ({ maxInputTokens: numCtx }),
      configurable: true,
    });
  }
  return createDeepAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer: getCheckpointer(),
    backend: buildBackend(),
    subagents: getSubagents(),
    middleware: [ollamaToolContentFix],
    interruptOn: buildInterruptOn(riskyToolNames),
  });
}

export function buildAgent(modelName: string): Promise<Agent> {
  let existing = cache.get(modelName);
  if (!existing) {
    existing = build(modelName);
    cache.set(modelName, existing);
  }
  return existing;
}
