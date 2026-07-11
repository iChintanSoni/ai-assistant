import { expect, test } from "vitest";
import { isEnvelope } from "../src/server/envelope.js";

test("isEnvelope accepts an object with v:1 and a string type", () => {
  expect(isEnvelope({ v: 1, type: "text", delta: "hi" })).toBe(true);
});

test("isEnvelope rejects non-objects, null, wrong version, and a missing/non-string type", () => {
  expect(isEnvelope(null)).toBe(false);
  expect(isEnvelope("a string")).toBe(false);
  expect(isEnvelope(42)).toBe(false);
  expect(isEnvelope({ v: 2, type: "text" })).toBe(false);
  expect(isEnvelope({ v: 1 })).toBe(false);
  expect(isEnvelope({ v: 1, type: 123 })).toBe(false);
});
