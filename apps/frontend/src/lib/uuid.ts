/**
 * A random UUID that also works outside a secure context.
 *
 * `crypto.randomUUID` is secure-context-only, so over plain http on anything but
 * localhost — which is exactly how the app is reached from a phone on the LAN — it
 * is `undefined`. Calling it there threw `crypto.randomUUID is not a function` on
 * the first keystroke of a send, which broke chat entirely rather than degrading.
 *
 * `crypto.getRandomValues` has no such restriction, so the fallback is still
 * cryptographically random — it just assembles the v4 layout by hand.
 */
export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
