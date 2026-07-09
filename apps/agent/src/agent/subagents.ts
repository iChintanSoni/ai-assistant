/** Subagents the orchestrator can delegate to (via the built-in `task` tool). */
import type { SubAgent } from "deepagents";
import { webSearch } from "./tools.js";

export function getSubagents(): SubAgent[] {
  return [
    {
      name: "researcher",
      description:
        "A web-research subagent. Delegate a research question to it and it will search the web and return a concise, sourced summary. Use it for questions that need current or external information.",
      systemPrompt:
        "You are a focused web-research assistant. Use the web_search tool to gather information, then reply with a concise summary (3-5 sentences) that includes the source URLs you used.",
      tools: [webSearch],
    },
  ];
}
