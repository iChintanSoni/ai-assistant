import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { THEME_COLOR } from './src/lib/themeColors.js'

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
      registerType: 'autoUpdate',
      // We register the SW ourselves (src/main.tsx) with a no-op onNeedReload
      // instead of the plugin's auto-injected script: with registerType
      // 'autoUpdate' and no onNeedReload, vite-plugin-pwa's default register
      // logic calls `window.location.reload()` the instant a new SW version
      // activates — including mid-session, silently discarding whatever the
      // user was typing in the composer.
      //
      // injectRegister: false also turns off the plugin's own auto-set of
      // workbox.skipWaiting/clientsClaim (it only sets those when
      // injectRegister is 'auto'/unset — see its source), so they're set
      // explicitly below instead: without them the new SW would sit in
      // 'waiting' forever, since nothing else ever tells it to activate.
      // skipWaiting/clientsClaim still let it take over network requests in
      // the background as soon as it installs; the no-op onNeedReload only
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
      },
      workbox: {
        // See the injectRegister comment above: explicit because
        // injectRegister: false skips the plugin's own auto-set of these.
        skipWaiting: true,
        clientsClaim: true,
        // No runtimeCaching entries: the default precache-only strategy
        // covers the app shell + static build assets. Never add a rule that
        // could cache the agent/file-storage API responses (PLAN.md F3) —
        // a stale model list, document status, or transcript is worse than
        // a loading state.
      },
    }),
  ],
})
