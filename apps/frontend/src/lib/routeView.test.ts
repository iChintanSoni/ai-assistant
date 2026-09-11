import { expect, test } from "vitest";

import { routeViewFromPath } from "./routeView";

test("the hub and a conversation are both the chat view", () => {
  expect(routeViewFromPath("/")).toBe("chat");
  expect(routeViewFromPath("/c/abc")).toBe("chat");
});

test("the files and settings paths map to their own views", () => {
  expect(routeViewFromPath("/files")).toBe("files");
  expect(routeViewFromPath("/settings")).toBe("settings");
});

test("a path that merely starts with a view name is not that view", () => {
  // "/filesystem" only ever redirects; classifying it as Files would light up the
  // rail and move focus for a view the user never reached.
  expect(routeViewFromPath("/filesystem")).toBe("chat");
  expect(routeViewFromPath("/settings-old")).toBe("chat");
});
