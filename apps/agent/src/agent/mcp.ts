/**
 * MCP client layer — the "consume an existing/first-party MCP server" tier
 * of the capability architecture (see docs/architecture.md). Servers are
 * declared in config/mcp-servers.json, not in code: adding a capability this
 * way means adding a JSON entry, not touching tools.ts/deepAgent.ts.
 *
 * A server entry may mark specific tool names `riskyTools` — those get
 * folded into the same HITL `interruptOn` gate as the built-in RISKY_TOOLS
 * (see deepAgent.ts), so an MCP-sourced tool can require approval too.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/agent/src/agent/mcp.ts -> repo root (works from both src/ and dist/, both 2 levels under apps/agent).
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

interface McpServerJsonEntry {
  transport?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  riskyTools?: string[];
}

interface McpServersFile {
  mcpServers: Record<string, McpServerJsonEntry>;
}

/** Repo-relative paths (e.g. "apps/mcp-authoring/dist/index.js") resolve against REPO_ROOT; anything else passes through as-is (a bare command like "uvx" or "node" resolved via PATH). */
function resolveArg(arg: string): string {
  return arg.startsWith("apps/") || arg.startsWith("packages/") ? path.resolve(REPO_ROOT, arg) : arg;
}

function readServerConfigs(): Record<string, McpServerJsonEntry> {
  if (!fs.existsSync(config.mcpServersConfigPath)) return {};
  const raw = fs.readFileSync(config.mcpServersConfigPath, "utf8");
  const parsed = JSON.parse(raw) as McpServersFile;
  return parsed.mcpServers ?? {};
}

interface McpBundle {
  tools: StructuredToolInterface[];
  riskyToolNames: string[];
}

let bundlePromise: Promise<McpBundle> | null = null;

async function loadBundle(): Promise<McpBundle> {
  const entries = readServerConfigs();
  const names = Object.keys(entries);
  if (names.length === 0) return { tools: [], riskyToolNames: [] };

  const mcpServers = Object.fromEntries(
    names.map((name) => {
      const entry = entries[name]!;
      if (entry.transport === "http" || entry.transport === "sse") {
        return [name, { transport: entry.transport, url: entry.url!, headers: entry.env }];
      }
      return [
        name,
        {
          transport: "stdio" as const,
          command: entry.command!,
          args: (entry.args ?? []).map(resolveArg),
          env: entry.env,
          // Anchors relative paths/module resolution (e.g. "apps/mcp-authoring/src/index.ts",
          // or resolving the "tsx" loader from the hoisted root node_modules) regardless of
          // which directory the agent process itself was started from.
          cwd: REPO_ROOT,
        },
      ];
    }),
  );

  const client = new MultiServerMCPClient({
    mcpServers,
    // A missing/broken server (e.g. uvx not installed on this machine) should
    // degrade to "that capability is unavailable", not take the whole agent down.
    onConnectionError: "ignore",
    throwOnLoadError: false,
  });

  const tools = await client.getTools();
  const loadedNames = new Set(tools.map((t) => t.name));
  // Only mark a tool risky if it actually loaded — a server that failed to
  // connect (onConnectionError: "ignore") shouldn't leave dead interruptOn entries.
  const riskyToolNames = names.flatMap((name) => entries[name]!.riskyTools ?? []).filter((n) => loadedNames.has(n));
  return { tools, riskyToolNames };
}

/** All tools exposed by configured MCP servers, plus which of their names must be HITL-gated. Loaded once and cached. */
export function getMcpBundle(): Promise<McpBundle> {
  if (!bundlePromise) bundlePromise = loadBundle();
  return bundlePromise;
}
