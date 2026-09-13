/** The self-describing A2A manifest served at /.well-known/agent-card.json. */
import type { AgentCard } from "@a2a-js/sdk";
import { config } from "../config.js";

export function buildAgentCard(): AgentCard {
  const defaultInputModes = [
    "text/plain",
    "application/json",
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/wav",
    "audio/mpeg",
  ];
  const defaultOutputModes = ["text/plain", "application/json"];

  return {
    name: "Aurora Assistant",
    description:
      "A general-purpose local assistant powered by Ollama + Deep Agents, speaking A2A.",
    supportedInterfaces: [
      {
        url: `${config.publicUrl}/a2a`,
        protocolBinding: "JSONRPC",
        tenant: "",
        protocolVersion: "1.0",
      },
    ],
    provider: undefined,
    version: "0.1.0",
    documentationUrl: undefined,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    // Superset the agent can accept; per-request gating is enforced by the model.
    defaultInputModes,
    defaultOutputModes,
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
        inputModes: defaultInputModes,
        outputModes: defaultOutputModes,
        securityRequirements: [],
      },
    ],
    signatures: [],
    iconUrl: undefined,
  };
}
