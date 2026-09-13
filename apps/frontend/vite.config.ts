import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { THEME_COLOR } from './src/lib/themeColors.js'
import { DOCUMENT_ACCEPT } from './src/lib/documentAccept.js'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // Vite rejects any Host header that isn't localhost or an IP, so reaching the
    // dev server by a name — which docs/setup.md recommends for phone access,
    // since a name resolves from both sides and keeps stored file URLs portable —
    // needs an explicit allowance. `true` disables the check rather than
    // allowlisting just *.local: this is a single-user tool with no
    // authentication (see the Security section in docs/setup.md), so the same LAN
    // naming scheme this is meant to unblock — Tailscale, a router-assigned
    // hostname, ngrok — shouldn't need a source edit to work.
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      // injectManifest, not the default generateSW: the share-target route
      // below needs a hand-written fetch listener (src/sw.ts) to intercept
      // the manifest's share_target POST, which a fully auto-generated
      // service worker has no hook for.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // We register the SW ourselves (src/main.tsx) with a no-op onNeedReload
      // instead of the plugin's auto-injected script: with registerType
      // 'autoUpdate' and no onNeedReload, vite-plugin-pwa's default register
      // logic calls `window.location.reload()` the instant a new SW version
      // activates — including mid-session, silently discarding whatever the
      // user was typing in the composer. sw.ts calls skipWaiting/clientsClaim
      // directly (no plugin-config equivalent under injectManifest — that's
      // a generateSW-only option) so the new version still takes over
      // network requests in the background; the no-op onNeedReload only
      // stops that from forcing a page reload.
      injectRegister: false,
      // Deliberately omitted (defaults to disabled): a service worker
      // serving a stale shell mid-development is a confusing failure mode
      // (PLAN.md F3) — `npm run dev` must never register one. Only a
      // production build does.
      // devOptions: { enabled: false },
      // Manifest icons are swept into the precache automatically; these two
      // are only referenced from <link> tags in index.html's head (tab icon,
      // iOS home-screen icon), which the precache glob doesn't pick up on
      // its own.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Aurora Assistant',
        short_name: 'Aurora',
        description: 'A general-purpose local assistant powered by Ollama + Deep Agents.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Matches dark:bg-slate-950, the real app-shell background, so the
        // OS splash screen doesn't flash a different color before paint.
        background_color: THEME_COLOR.dark,
        theme_color: THEME_COLOR.dark,
        icons: [
          // One safe-zone-padded design serves both purposes — avoids
          // maintaining two separate icon designs.
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        // Same accept list the paperclip already advertises (lib/documents.ts's
        // DOCUMENT_ACCEPT) — the OS share sheet should only offer this app for
        // files it can already handle, nothing new to validate. sw.ts
        // intercepts the resulting POST; ShareTargetRoute.tsx renders it.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: DOCUMENT_ACCEPT.split(',') }] },
        },
      },
    }),
  ],
})
