/** Where the A2A agent lives. CORS is enabled server-side, so we connect directly. */
const env = import.meta.env as Record<string, string | undefined>;

export const AGENT_URL = env.VITE_AGENT_URL?.replace(/\/$/, "") || "http://localhost:4000";

/** Where attachments are uploaded before a message references them by URL. */
export const FILE_STORAGE_URL =
  env.VITE_FILE_STORAGE_URL?.replace(/\/$/, "") || "http://localhost:6060";

/** Max files simultaneously attached/active for a conversation (documents + other attachments combined). */
export const MAX_ATTACHMENTS = 5;
