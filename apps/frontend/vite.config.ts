import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
      injectRegister: 'auto',
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
        background_color: '#020617',
        theme_color: '#020617',
        icons: [
          // One safe-zone-padded design serves both purposes — avoids
          // maintaining two separate icon designs.
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // No runtimeCaching entries: the default precache-only strategy
        // covers the app shell + static build assets. Never add a rule that
        // could cache the agent/file-storage API responses (PLAN.md F3) —
        // a stale model list, document status, or transcript is worse than
        // a loading state.
      },
    }),
  ],
})
