/**
 * Moves focus into the newly rendered view on navigation, so keyboard and
 * screen-reader users land in the content they asked for instead of staying on the
 * rail button they left behind.
 *
 * Keyed on the *view* rather than the pathname on purpose: a streaming chat
 * rewrites `/` to `/c/:id` the moment the agent assigns a contextId, and yanking
 * focus out of the composer mid-sentence would be worse than not moving it at all.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { routeViewFromPath } from "../lib/routeView";

export function useFocusOnRouteChange(): void {
  const { pathname } = useLocation();
  const view = routeViewFromPath(pathname);
  // null until the first effect runs — the initial render is an arrival, not a
  // navigation, and should leave focus wherever the browser put it.
  const lastView = useRef<string | null>(null);

  useEffect(() => {
    const previous = lastView.current;
    lastView.current = view;
    if (previous === null || previous === view) return;
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }, [view]);
}
