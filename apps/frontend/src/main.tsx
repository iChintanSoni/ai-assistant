import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// onNeedReload: a no-op, deliberately — see the comment on VitePWA's
// injectRegister in vite.config.ts. The new service worker still takes over
// in the background; this just avoids forcing a reload (and losing whatever
// the user was typing) the instant it activates.
registerSW({ onNeedReload: () => {} })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
