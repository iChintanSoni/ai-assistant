import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useBlockStrayFileDrops } from "./useBlockStrayFileDrops";

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

test("registers window-level dragover/drop guards on mount and cleans them up on unmount", () => {
  const { unmount } = renderHook(() => useBlockStrayFileDrops());
  expect(addSpy).toHaveBeenCalledWith("dragover", expect.any(Function));
  expect(addSpy).toHaveBeenCalledWith("drop", expect.any(Function));
  unmount();
  expect(removeSpy).toHaveBeenCalledWith("dragover", expect.any(Function));
  expect(removeSpy).toHaveBeenCalledWith("drop", expect.any(Function));
});

test("the guard preventDefaults a stray drop, which is what stops the browser navigating away", () => {
  renderHook(() => useBlockStrayFileDrops());
  const event = new Event("drop", { cancelable: true, bubbles: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
