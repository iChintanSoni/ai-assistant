/** User preference for background-completion notifications (lib/notify.ts). */
import { create } from "zustand";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "../lib/notify";

const STORAGE_KEY = "aurora-notifications";

function readStoredEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

interface NotificationsState {
  /** User's in-app preference. Only takes effect when `permission` is "granted". */
  enabled: boolean;
  /** The browser's live permission — never restored from storage, always read fresh. */
  permission: NotificationPermission | "unsupported";
  /** Turning on requests permission (must be called from a user gesture); turning off never prompts. */
  setEnabled: (next: boolean) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  enabled: readStoredEnabled(),
  permission: getNotificationPermission(),

  setEnabled: async (next) => {
    if (!next) {
      localStorage.setItem(STORAGE_KEY, "false");
      set({ enabled: false });
      return;
    }
    const permission = await requestNotificationPermission();
    const enabled = permission === "granted";
    localStorage.setItem(STORAGE_KEY, String(enabled));
    set({ enabled, permission });
  },
}));
