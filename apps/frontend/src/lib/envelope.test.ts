import { expect, test } from "vitest";
import { isEnvelope } from "./envelope";

test("accepts a valid envelope shape", () => {
  expect(isEnvelope({ v: 1, type: "text" })).toBe(true);
});

test("rejects non-objects, null, wrong version, and a missing/non-string type", () => {
  expect(isEnvelope(null)).toBe(false);
  expect(isEnvelope("x")).toBe(false);
  expect(isEnvelope(42)).toBe(false);
  expect(isEnvelope({ v: 2, type: "text" })).toBe(false);
  expect(isEnvelope({ v: 1 })).toBe(false);
  expect(isEnvelope({ v: 1, type: 5 })).toBe(false);
});
