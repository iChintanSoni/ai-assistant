import { afterEach, expect, test, vi } from "vitest";

import { randomUUID } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

test("uses the native implementation when it exists", () => {
  const native = vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-2222-4333-8444-555555555555");
  expect(randomUUID()).toBe("11111111-2222-4333-8444-555555555555");
  expect(native).toHaveBeenCalled();
});

test("falls back to a real v4 where crypto.randomUUID is missing", () => {
  // Exactly the insecure-context case: served over plain http from a LAN address,
  // crypto.randomUUID is undefined and calling it broke sending outright.
  vi.spyOn(crypto, "randomUUID").mockReturnValue(undefined as unknown as `${string}-${string}-${string}-${string}-${string}`);
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });

  const id = randomUUID();
  expect(id).toMatch(V4);
});

test("the fallback doesn't repeat itself", () => {
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  const ids = new Set(Array.from({ length: 200 }, () => randomUUID()));
  expect(ids.size).toBe(200);
});
