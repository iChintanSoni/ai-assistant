import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// With `test.globals: false`, RTL's automatic afterEach(cleanup) registration
// never runs (it only self-registers when it detects a global `afterEach`),
// so it must be wired up explicitly here or every test leaks DOM into the next.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia; the theme store calls it at import time.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom doesn't implement these either; useAttachments creates preview URLs for images.
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:mock");
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();

// jsdom doesn't implement this; Conversation auto-scrolls to the latest turn.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
