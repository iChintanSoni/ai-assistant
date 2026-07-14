import { expect, test } from "vitest";
import { deleteSetting, getSetting, setSetting } from "../src/agent/settingsStore.js";

test("getSetting returns null for an unset key", () => {
  expect(getSetting("nope")).toBeNull();
});

test("setSetting then getSetting round-trips a value", () => {
  setSetting("k1", "v1");
  expect(getSetting("k1")).toBe("v1");
});

test("setSetting overwrites an existing value for the same key", () => {
  setSetting("k2", "first");
  setSetting("k2", "second");
  expect(getSetting("k2")).toBe("second");
});

test("deleteSetting removes a key so getSetting reverts to null", () => {
  setSetting("k3", "v3");
  deleteSetting("k3");
  expect(getSetting("k3")).toBeNull();
});

test("deleteSetting on an unset key is a no-op", () => {
  expect(() => deleteSetting("never-set")).not.toThrow();
});
