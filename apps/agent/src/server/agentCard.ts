/** The self-describing A2A manifest served at /.well-known/agent-card.json. */
import type { AgentCard } from "@a2a-js/sdk";
import { config } from "../config.js";

export function buildAgentCard(): AgentCard {
  return {
    protocolVersion: "0.3.0",
    name: "Aurora Assistant",
    description:
      "A general-purpose local assistant powered by Ollama + Deep Agents, speaking A2A.",
    url: `${config.publicUrl}/a2a`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    // Superset the agent can accept; per-request gating is enforced by the model.
    defaultInputModes: [
      "text/plain",
      "application/json",
      "image/png",
      "image/jpeg",
      "image/webp",
      "audio/wav",
      "audio/mpeg",
    ],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "general-assistant",
        name: "General assistant",
        description:
          "Answer questions, reason step by step, and use tools. Works with text, structured data, and files.",
        tags: ["chat", "assistant", "tools", "reasoning"],
        examples: [
          "What time is it right now?",
          "Give me a random number between 1 and 100.",
          "Summarize this and list three takeaways.",
        ],
      },
    ],
  };
}
