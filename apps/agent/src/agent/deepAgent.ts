/** Build (and cache) a deep agent per Ollama model. */
import { createDeepAgent } from "deepagents";
import { ChatOllama } from "@langchain/ollama";
import { getCheckpointer } from "./checkpointer.js";
import { getTools, RISKY_TOOLS } from "./tools.js";
import { buildBackend } from "./backends.js";
import { getSubagents } from "./subagents.js";
import { ollamaToolContentFix } from "./middleware.js";
import { config } from "../config.js";

// Risky tools pause for human approve/reject before executing (HITL).
const interruptOn = Object.fromEntries(
  RISKY_TOOLS.map((name) => [
    name,
    { allowedDecisions: ["approve", "reject"] as ("approve" | "reject")[], description: "Review this action before it runs." },
  ]),
);

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
- The user can upload documents (PDF, Word, PowerPoint, text, spreadsheets) to a persistent
  library, separate from the /memories/ filesystem above. Never use ls/glob/read_file to look
  for uploaded documents — those only see your memory folder and will never find them. Instead,
  go straight to search_documents to answer specific questions about a document's content — it
  returns excerpts with a document name and page number(s); cite them (e.g. "(report.pdf, p.4)")
  in your answer. Use summarize_document instead when the user wants an overview of a whole
  document or a specific range of pages (a chapter/section) rather than an answer to a pointed
  question — don't try to build a summary yourself out of search_documents excerpts.`;

export type Agent = Awaited<ReturnType<typeof createDeepAgent>>;

const cache = new Map<string, Promise<Agent>>();

export function buildAgent(modelName: string): Promise<Agent> {
  let existing = cache.get(modelName);
  if (!existing) {
    const model = new ChatOllama({ model: modelName, baseUrl: config.ollamaBaseUrl });
    existing = Promise.resolve(
      createDeepAgent({
        model,
        tools: getTools(),
        systemPrompt: SYSTEM_PROMPT,
        checkpointer: getCheckpointer(),
        backend: buildBackend(),
        subagents: getSubagents(),
        middleware: [ollamaToolContentFix],
        interruptOn,
      }),
    );
    cache.set(modelName, existing);
  }
  return existing;
}
