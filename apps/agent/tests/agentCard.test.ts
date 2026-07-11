import { expect, test } from "vitest";
import { buildAgentCard } from "../src/server/agentCard.js";
import { config } from "../src/config.js";

test("buildAgentCard wires the A2A endpoint url from config.publicUrl", () => {
  const card = buildAgentCard();
  expect(card.url).toBe(`${config.publicUrl}/a2a`);
});

test("buildAgentCard advertises streaming and the general-assistant skill", () => {
  const card = buildAgentCard();
  expect(card.capabilities.streaming).toBe(true);
  expect(card.capabilities.pushNotifications).toBe(false);
  expect(card.skills).toHaveLength(1);
  expect(card.skills[0]!.id).toBe("general-assistant");
});
