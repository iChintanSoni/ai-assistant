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

// A POST navigation (what an OS share sheet or any <form method="post">
// produces) is still `mode: 'navigate'`, but that's not what separates this
// route from the SPA-shell one below: workbox buckets registered routes by
// HTTP method (Route defaults to 'GET' unless given one explicitly, and
// NavigationRoute never passes one — see its constructor), and dispatches
// by looking up only the bucket matching the incoming request's method. A
// POST can never reach the GET-bucketed NavigationRoute, so registration
// order between the two doesn't matter here — declaring "POST" below is
// what actually does the separating.
//
// The handler is wrapped in try/catch because workbox only applies a
// route's own `.catch` fallback (none is set here) or a router-wide one
// (none is set either) — an uncaught rejection would otherwise surface to
// the browser as a failed/aborted navigation instead of the app's own
// honest "nothing to add" state.
registerRoute(
  ({ url, request }) => request.method === "POST" && url.pathname === SHARE_TARGET_PATH,
  async ({ request }) => {
    try {
      const formData = await request.formData();
      const files = formData.getAll("file").filter((f: FormDataEntryValue): f is File => f instanceof File);
      await putPendingShare(files);
    } catch (err) {
      // Nothing got stashed; ShareTargetRoute's own empty state covers this
      // (accurately enough — there's nothing left to add either way) rather
      // than failing the navigation outright.
      console.error("share-target: failed to store the shared file(s)", err);
    }
    return Response.redirect(SHARE_TARGET_PATH, 303);
  },
  "POST",
);

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
