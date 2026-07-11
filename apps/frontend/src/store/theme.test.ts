import { afterEach, beforeEach, expect, test, vi } from "vitest";

function mockMatchMedia(initialMatches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return {
    dispatchChange(matches: boolean) {
      mql.matches = matches;
      for (const cb of listeners) cb({ matches });
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("defaults to 'auto' resolved against the system scheme (light)", async () => {
  mockMatchMedia(false);
  const { useThemeStore } = await import("./theme");
  const s = useThemeStore.getState();
  expect(s.preference).toBe("auto");
  expect(s.resolved).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("defaults to 'auto' resolved against the system scheme (dark), applying the dark class", async () => {
  mockMatchMedia(true);
  const { useThemeStore } = await import("./theme");
  expect(useThemeStore.getState().resolved).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("restores a previously stored explicit preference, ignoring the system scheme", async () => {
  localStorage.setItem("aurora-theme", "dark");
  mockMatchMedia(false); // system says light, stored preference should still win
  const { useThemeStore } = await import("./theme");
  const s = useThemeStore.getState();
  expect(s.preference).toBe("dark");
  expect(s.resolved).toBe("dark");
});

test("ignores a garbage stored value and falls back to auto", async () => {
  localStorage.setItem("aurora-theme", "not-a-real-value");
  mockMatchMedia(false);
  const { useThemeStore } = await import("./theme");
  expect(useThemeStore.getState().preference).toBe("auto");
});

test("setPreference updates state, persists to localStorage, and applies the dark class", async () => {
  mockMatchMedia(false);
  const { useThemeStore } = await import("./theme");
  useThemeStore.getState().setPreference("dark");
  const s = useThemeStore.getState();
  expect(s.preference).toBe("dark");
  expect(s.resolved).toBe("dark");
  expect(localStorage.getItem("aurora-theme")).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("a live system-scheme change updates resolved only while preference is 'auto'", async () => {
  const { dispatchChange } = mockMatchMedia(false);
  const { useThemeStore } = await import("./theme");
  expect(useThemeStore.getState().resolved).toBe("light");

  dispatchChange(true);
  expect(useThemeStore.getState().resolved).toBe("dark");
});

test("a live system-scheme change is ignored once an explicit preference is set", async () => {
  const { dispatchChange } = mockMatchMedia(false);
  const { useThemeStore } = await import("./theme");
  useThemeStore.getState().setPreference("light");

  dispatchChange(true); // system flips to dark, but preference is explicitly "light"
  expect(useThemeStore.getState().resolved).toBe("light");
});
