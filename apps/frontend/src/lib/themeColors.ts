/**
 * The app-shell background per resolved theme (bg-white / dark:bg-slate-950).
 * Shared source of truth for store/theme.ts's live theme-color-meta sync and
 * vite.config.ts's manifest background_color/theme_color. index.html's
 * pre-paint inline script can't import this (it runs before any module
 * graph exists) and keeps its own literal copy — keep that one in sync by
 * hand if these values ever change.
 */
export const THEME_COLOR = { light: "#ffffff", dark: "#020617" } as const;
