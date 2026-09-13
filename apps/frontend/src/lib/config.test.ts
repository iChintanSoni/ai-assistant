import { expect, test } from "vitest";

import { AGENT_URL, FILE_STORAGE_URL, resolveServiceUrl } from "./config";

const phone = { protocol: "http:", hostname: "192.168.1.5" };

test("a service defaults to the host the page was loaded from", () => {
  // The whole point: hardcoding localhost meant that on a phone, "localhost" was
  // the phone — every request went nowhere.
  expect(resolveServiceUrl(undefined, 4000, phone)).toBe("http://192.168.1.5:4000");
  expect(resolveServiceUrl(undefined, 6060, phone)).toBe("http://192.168.1.5:6060");
});

test("localhost still resolves to localhost", () => {
  expect(resolveServiceUrl(undefined, 4000, { protocol: "http:", hostname: "localhost" })).toBe(
    "http://localhost:4000",
  );
});

test("the protocol follows the page too", () => {
  expect(resolveServiceUrl(undefined, 4000, { protocol: "https:", hostname: "aurora.local" })).toBe(
    "https://aurora.local:4000",
  );
});

test("an explicit override wins, with any trailing slash trimmed", () => {
  expect(resolveServiceUrl("http://elsewhere:9999/", 4000, phone)).toBe("http://elsewhere:9999");
});

test("an empty override falls through rather than producing a bare port", () => {
  // Vite hands through an unset var as "", which must not beat the derived host.
  expect(resolveServiceUrl("", 4000, phone)).toBe("http://192.168.1.5:4000");
});

test("the exported constants resolve against the test environment's own host", () => {
  expect(AGENT_URL).toBe("http://localhost:4000");
  expect(FILE_STORAGE_URL).toBe("http://localhost:6060");
});
