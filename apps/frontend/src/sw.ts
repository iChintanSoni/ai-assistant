/**
 * Hand-written service worker (vite-plugin-pwa's `injectManifest` strategy).
 * Switched here from `generateSW` specifically to intercept the share-target
 * POST below — everything else (precache, SPA navigation fallback,
 * skipWaiting/clientsClaim) reproduces what `generateSW` did automatically
 * for F3, just in code instead of plugin config.
 */
import { clientsClaim } from "workbox-core";
import { createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { putPendingShare } from "./lib/pendingShareStore";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

self.skipWaiting();
clientsClaim();

// No routes beyond what's below: the app shell + static build assets are
// precached, and the agent/file-storage API origins are never routed through
// this service worker at all (PLAN.md F3) — a stale model list, document
// status, or transcript is worse than a loading state.
precacheAndRoute(self.__WB_MANIFEST);

const SHARE_TARGET_PATH = "/share-target";

// Registered before the navigation route below: workbox also treats a POST
// navigation as `mode: 'navigate'`, and the router dispatches to the first
// registered route that matches — including the method declared here — so
// registration order is what keeps this POST from falling through to the
// SPA-shell handler instead. The browser's own 303-redirect follow-up is a
// plain GET, which *does* fall through to the navigation route below,
// landing on ShareTargetRoute.
registerRoute(
  ({ url, request }) => request.method === "POST" && url.pathname === SHARE_TARGET_PATH,
  async ({ request }) => {
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f: FormDataEntryValue): f is File => f instanceof File);
    await putPendingShare(files);
    return Response.redirect(SHARE_TARGET_PATH, 303);
  },
  "POST",
);

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
