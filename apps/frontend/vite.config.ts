import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

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
    babel({ presets: [reactCompilerPreset()] })
  ],
})
