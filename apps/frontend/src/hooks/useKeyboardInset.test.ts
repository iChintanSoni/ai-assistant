import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useKeyboardInset } from "./useKeyboardInset";

type Listener = () => void;

function stubViewport(state: { height: number; offsetTop?: number; scale?: number }) {
  const listeners: Listener[] = [];
  const vv = {
    height: state.height,
    offsetTop: state.offsetTop ?? 0,
    scale: state.scale ?? 1,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true, writable: true });
  return {
    vv,
    listenerCount: () => listeners.length,
    emit: (next: Partial<typeof state>) => {
      Object.assign(vv, next);
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 812, configurable: true, writable: true });
});

afterEach(() => {
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true, writable: true });
  vi.restoreAllMocks();
});

test("reports nothing when the viewport fills the window", () => {
  stubViewport({ height: 812 });
  const { result } = renderHook(() => useKeyboardInset());
  expect(result.current).toBe(0);
});

test("reports the covered height once a keyboard opens", () => {
  const vp = stubViewport({ height: 812 });
  const { result } = renderHook(() => useKeyboardInset());
  act(() => vp.emit({ height: 476 }));
  expect(result.current).toBe(336);
});

test("ignores pinch-zoom, which shrinks the visual viewport without a keyboard", () => {
  // Zooming to 2x halves visualViewport.height — read naively that looks like a
  // 400px keyboard, and padding the shell by it would clip half the app away.
  const vp = stubViewport({ height: 812 });
  const { result } = renderHook(() => useKeyboardInset());
  act(() => vp.emit({ height: 406, scale: 2 }));
  expect(result.current).toBe(0);
});

test("treats a few stray pixels as no keyboard", () => {
  const vp = stubViewport({ height: 812 });
  const { result } = renderHook(() => useKeyboardInset());
  act(() => vp.emit({ height: 800 }));
  expect(result.current).toBe(0);
});

test("detaches its listeners on unmount", () => {
  const vp = stubViewport({ height: 812 });
  const { unmount } = renderHook(() => useKeyboardInset());
  expect(vp.listenerCount()).toBe(2);
  unmount();
  expect(vp.listenerCount()).toBe(0);
});

test("is inert where visualViewport doesn't exist", () => {
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true, writable: true });
  const { result } = renderHook(() => useKeyboardInset());
  expect(result.current).toBe(0);
});
