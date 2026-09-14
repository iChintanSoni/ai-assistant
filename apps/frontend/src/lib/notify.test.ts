import { afterEach, beforeEach, expect, test, vi } from "vitest";

class MockNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>();
  static instances: MockNotification[] = [];
  title: string;
  options?: NotificationOptions;
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

beforeEach(() => {
  setVisibility("hidden");
  MockNotification.permission = "granted";
  MockNotification.requestPermission.mockReset().mockResolvedValue("granted");
  MockNotification.instances = [];
  vi.stubGlobal("Notification", MockNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("isNotificationSupported / getNotificationPermission reflect an unsupported browser", async () => {
  vi.unstubAllGlobals();
  const { isNotificationSupported, getNotificationPermission } = await import("./notify");
  expect(isNotificationSupported()).toBe(false);
  expect(getNotificationPermission()).toBe("unsupported");
});

test("getNotificationPermission reads the live Notification.permission", async () => {
  MockNotification.permission = "denied";
  const { getNotificationPermission } = await import("./notify");
  expect(getNotificationPermission()).toBe("denied");
});

test("requestNotificationPermission delegates to Notification.requestPermission", async () => {
  MockNotification.requestPermission.mockResolvedValue("granted");
  const { requestNotificationPermission } = await import("./notify");
  await expect(requestNotificationPermission()).resolves.toBe("granted");
  expect(MockNotification.requestPermission).toHaveBeenCalled();
});

test("requestNotificationPermission returns 'unsupported' without a Notification global", async () => {
  vi.unstubAllGlobals();
  const { requestNotificationPermission } = await import("./notify");
  await expect(requestNotificationPermission()).resolves.toBe("unsupported");
});

test("notifyIfHidden fires a notification when hidden and permission is granted", async () => {
  const { notifyIfHidden } = await import("./notify");
  notifyIfHidden("Response ready", "here you go");
  expect(MockNotification.instances).toHaveLength(1);
  expect(MockNotification.instances[0]).toMatchObject({
    title: "Response ready",
    options: { body: "here you go", icon: "/icon-192.png" },
  });
});

test("notifyIfHidden's click handler focuses the window and closes the notification", async () => {
  const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
  const { notifyIfHidden } = await import("./notify");
  notifyIfHidden("Response ready");
  const instance = MockNotification.instances[0]!;
  instance.onclick?.();
  expect(focusSpy).toHaveBeenCalled();
  expect(instance.close).toHaveBeenCalled();
});

test("notifyIfHidden does nothing while the tab is visible", async () => {
  setVisibility("visible");
  const { notifyIfHidden } = await import("./notify");
  notifyIfHidden("Response ready");
  expect(MockNotification.instances).toHaveLength(0);
});

test("notifyIfHidden does nothing when permission isn't granted", async () => {
  MockNotification.permission = "default";
  const { notifyIfHidden } = await import("./notify");
  notifyIfHidden("Response ready");
  expect(MockNotification.instances).toHaveLength(0);
});

test("notifyIfHidden never throws even if the constructor does", async () => {
  vi.stubGlobal(
    "Notification",
    class {
      static permission = "granted";
      constructor() {
        throw new Error("boom");
      }
    },
  );
  const { notifyIfHidden } = await import("./notify");
  expect(() => notifyIfHidden("Response ready")).not.toThrow();
});
