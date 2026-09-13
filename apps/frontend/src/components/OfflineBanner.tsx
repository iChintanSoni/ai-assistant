/**
 * A device-offline notice, distinct from ChatRoute's ErrorNote: navigator.onLine
 * tracks the device's own network link, not whether the agent server specifically
 * is reachable, so both can be true (or false) independently — this doesn't
 * replace that message, it covers the case a page reload can't even fetch /models.
 */
export function OfflineBanner({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;
  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top)] z-30 mx-auto mt-2 w-fit rounded-full bg-rose-50 px-4 py-1.5 text-center text-sm text-rose-600 shadow-sm ring-1 ring-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:ring-rose-800/60"
    >
      You&apos;re offline — some features won&apos;t work until you reconnect.
    </p>
  );
}
