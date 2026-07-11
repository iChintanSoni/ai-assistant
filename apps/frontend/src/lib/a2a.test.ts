import { expect, test, vi } from "vitest";

const { createFromUrlMock } = vi.hoisted(() => ({
  createFromUrlMock: vi.fn().mockResolvedValue({ __client: true }),
}));

vi.mock("@a2a-js/sdk/client", () => ({
  ClientFactory: vi.fn(function () {
    return { createFromUrl: createFromUrlMock };
  }),
}));

import { ClientFactory } from "@a2a-js/sdk/client";
import { AGENT_URL } from "./config";
import { getClient } from "./a2a";

test("getClient creates exactly one client for the agent URL, reused across calls", async () => {
  const first = await getClient();
  const second = await getClient();

  expect(first).toEqual({ __client: true });
  expect(first).toBe(second);
  expect(ClientFactory).toHaveBeenCalledTimes(1);
  expect(createFromUrlMock).toHaveBeenCalledWith(AGENT_URL);
});
