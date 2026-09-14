import { afterEach, beforeEach, expect, test, vi } from "vitest";

class MockNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn();
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  MockNotification.permission = "default";
  MockNotification.requestPermission.mockReset();
  vi.stubGlobal("Notification", MockNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("defaults to disabled, reading the browser's live permission", async () => {
  MockNotification.permission = "denied";
  const { useNotificationsStore } = await import("./notifications");
  const s = useNotificationsStore.getState();
  expect(s.enabled).toBe(false);
  expect(s.permission).toBe("denied");
});

test("restores a previously enabled preference from storage", async () => {
  localStorage.setItem("aurora-notifications", "true");
  const { useNotificationsStore } = await import("./notifications");
  expect(useNotificationsStore.getState().enabled).toBe(true);
});

test("permission is always read live, never restored from storage", async () => {
  localStorage.setItem("aurora-notifications", "true");
  MockNotification.permission = "denied";
  const { useNotificationsStore } = await import("./notifications");
  expect(useNotificationsStore.getState().permission).toBe("denied");
});

test("setEnabled(true) requests permission and enables only on grant", async () => {
  MockNotification.requestPermission.mockResolvedValue("granted");
  const { useNotificationsStore } = await import("./notifications");
  await useNotificationsStore.getState().setEnabled(true);
  expect(MockNotification.requestPermission).toHaveBeenCalled();
  expect(useNotificationsStore.getState().enabled).toBe(true);
  expect(localStorage.getItem("aurora-notifications")).toBe("true");
});

test("setEnabled(true) stays disabled if the user denies the prompt", async () => {
  MockNotification.requestPermission.mockResolvedValue("denied");
  const { useNotificationsStore } = await import("./notifications");
  await useNotificationsStore.getState().setEnabled(true);
  expect(useNotificationsStore.getState().enabled).toBe(false);
  expect(useNotificationsStore.getState().permission).toBe("denied");
});

test("setEnabled(false) disables without prompting", async () => {
  localStorage.setItem("aurora-notifications", "true");
  MockNotification.permission = "granted";
  const { useNotificationsStore } = await import("./notifications");
  await useNotificationsStore.getState().setEnabled(false);
  expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  expect(useNotificationsStore.getState().enabled).toBe(false);
  expect(localStorage.getItem("aurora-notifications")).toBe("false");
});
