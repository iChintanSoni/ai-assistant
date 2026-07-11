import { expect, test } from "vitest";
import { getSubagents } from "../src/agent/subagents.js";

test("getSubagents returns a researcher subagent wired with the web_search tool", () => {
  const subagents = getSubagents();
  expect(subagents).toHaveLength(1);
  const researcher = subagents[0]!;
  expect(researcher.name).toBe("researcher");
  expect(researcher.tools?.some((t) => t.name === "web_search")).toBe(true);
});
