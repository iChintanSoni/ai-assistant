/**
 * Background-completion notifications, via the page's own Notification
 * instance (no service worker / push server) — only meaningful while this
 * tab is still alive, just not focused. See docs/frontend.md's
 * "Notifications" section for why a fully-closed-app push isn't in scope
 * (would need Push API + a push server, which conflicts with local-first).
 */

export function isNotificationSupported(): boolean {
  return "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  return isNotificationSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.requestPermission();
}

function canNotify(): boolean {
  return isNotificationSupported() && Notification.permission === "granted";
}

/**
 * Fires only when the tab is hidden and permission is granted — while
 * visible, the live UI already shows this, so a notification would just be
 * redundant noise. Never throws (I7): a notification failure must not
 * interrupt the flow that triggered it.
 */
export function notifyIfHidden(title: string, body?: string): void {
  if (document.visibilityState !== "hidden" || !canNotify()) return;
  try {
    const notification = new Notification(title, { body, icon: "/icon-192.png" });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.error("Failed to show notification:", err);
  }
}
