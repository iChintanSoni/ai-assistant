/** Appearance setting: Auto/Light/Dark preference, resolved against system scheme. */
import { create } from "zustand";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "aurora-theme";

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === "auto" ? (prefersDark ? "dark" : "light") : preference;
}

function applyThemeClass(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const initialPreference = readStoredPreference();
const initialResolved = resolveTheme(initialPreference, systemPrefersDark());
applyThemeClass(initialResolved);

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialPreference,
  resolved: initialResolved,

  setPreference: (preference) =>
    set(() => {
      localStorage.setItem(STORAGE_KEY, preference);
      const resolved = resolveTheme(preference, systemPrefersDark());
      applyThemeClass(resolved);
      return { preference, resolved };
    }),
}));

// Keep "auto" live: follow the OS scheme without requiring a reload.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  const { preference } = useThemeStore.getState();
  if (preference !== "auto") return;
  const resolved = resolveTheme(preference, e.matches);
  applyThemeClass(resolved);
  useThemeStore.setState({ resolved });
});
