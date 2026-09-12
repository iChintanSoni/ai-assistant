import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // Vite rejects any Host header that isn't localhost or an IP, so reaching the
    // dev server by the machine's mDNS name — which is what docs/setup.md
    // recommends for phone access, because it resolves from both sides and keeps
    // stored file URLs portable — needs an explicit allowance. A leading dot
    // matches the suffix, so this covers every *.local name.
    allowedHosts: [".local"],
  },
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
