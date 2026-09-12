const env = import.meta.env as Record<string, string | undefined>;

/**
 * Services are assumed to sit on the same host the page came from.
 *
 * Hardcoding `localhost` meant the app only ever worked on the machine running it:
 * opened from a phone over the LAN, `localhost` is *the phone*, so every request
 * went nowhere. Deriving the host instead means loading the UI from
 * `http://192.168.1.5:5173` talks to `192.168.1.5:4000` with nothing to configure.
 *
 * `VITE_AGENT_URL` / `VITE_FILE_STORAGE_URL` still win when the services genuinely
 * live somewhere else.
 */
export function resolveServiceUrl(
  override: string | undefined,
  port: number,
  location: { protocol: string; hostname: string } = window.location,
): string {
  const explicit = override?.replace(/\/$/, "");
  if (explicit) return explicit;
  return `${location.protocol}//${location.hostname}:${port}`;
}

/** Where the A2A agent lives. CORS is enabled server-side, so we connect directly. */
export const AGENT_URL = resolveServiceUrl(env.VITE_AGENT_URL, 4000);

/** Where attachments are uploaded before a message references them by URL. */
export const FILE_STORAGE_URL = resolveServiceUrl(env.VITE_FILE_STORAGE_URL, 6060);

/** Max files simultaneously attached/active for a conversation (documents + other attachments combined). */
export const MAX_ATTACHMENTS = 5;

/** Who the assistant is greeting. Single-user app — see the README's "Not built". */
export const USER_NAME = "Chintan";
