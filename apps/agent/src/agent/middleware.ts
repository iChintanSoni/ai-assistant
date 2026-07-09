/**
 * ChatOllama requires ToolMessage content to be a plain string, but deepagents'
 * filesystem tools (read_file, ls, …) can return content blocks (arrays). This
 * middleware flattens tool-message content to text right before the model call,
 * so local Ollama models can consume tool results.
 */
import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";

function flatten(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "string"
          ? b
          : b && typeof b === "object" && "text" in b
            ? String((b as { text: unknown }).text)
            : JSON.stringify(b),
      )
      .join("\n");
  }
  return JSON.stringify(content);
}

export const ollamaToolContentFix = createMiddleware({
  name: "ollamaToolContentFix",
  wrapModelCall: async (request, handler) => {
    let changed = false;
    const messages = request.messages.map((m) => {
      if (m.getType() === "tool" && typeof m.content !== "string") {
        changed = true;
        return new ToolMessage({
          content: flatten(m.content),
          tool_call_id: (m as ToolMessage).tool_call_id,
          name: m.name,
          id: m.id,
        });
      }
      return m;
    });
    return handler(changed ? { ...request, messages } : request);
  },
});
