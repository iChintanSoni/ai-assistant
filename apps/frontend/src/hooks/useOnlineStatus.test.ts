import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useOnlineStatus } from "./useOnlineStatus";

function stubOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true, writable: true });
}

beforeEach(() => {
  stubOnline(true);
});

afterEach(() => {
  stubOnline(true);
  vi.restoreAllMocks();
});

test("reflects navigator.onLine on mount", () => {
  stubOnline(false);
  const { result } = renderHook(() => useOnlineStatus());
  expect(result.current).toBe(false);
});

test("flips to false on an 'offline' event", () => {
  const { result } = renderHook(() => useOnlineStatus());
  expect(result.current).toBe(true);
  act(() => window.dispatchEvent(new Event("offline")));
  expect(result.current).toBe(false);
});

test("flips back to true on an 'online' event", () => {
  stubOnline(false);
  const { result } = renderHook(() => useOnlineStatus());
  expect(result.current).toBe(false);
  act(() => window.dispatchEvent(new Event("online")));
  expect(result.current).toBe(true);
});

test("detaches its listeners on unmount", () => {
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");
  const { unmount } = renderHook(() => useOnlineStatus());
  unmount();
  const added = addSpy.mock.calls.filter((c) => c[0] === "online" || c[0] === "offline").length;
  const removed = removeSpy.mock.calls.filter((c) => c[0] === "online" || c[0] === "offline").length;
  expect(added).toBe(2);
  expect(removed).toBe(2);
});
