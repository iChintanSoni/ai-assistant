import { expect, test } from "vitest";
import { deleteFile, getFile, insertFile, listFiles } from "../src/store.js";

function meta(filename: string, overrides: Partial<Parameters<typeof insertFile>[0]> = {}) {
  return { filename, originalName: filename, mimeType: "image/png", size: 10, createdAt: Date.now(), ...overrides };
}

test("insertFile + getFile round-trips a file's metadata", () => {
  insertFile(meta("a.png"));
  expect(getFile("a.png")).toEqual(meta("a.png", { createdAt: getFile("a.png")!.createdAt }));
});

test("getFile returns null for an unknown filename", () => {
  expect(getFile("does-not-exist.png")).toBeNull();
});

test("listFiles orders most-recently-created first", () => {
  insertFile(meta("older.png", { createdAt: 1000 }));
  insertFile(meta("newer.png", { createdAt: 2000 }));
  const names = listFiles()
    .filter((f) => f.filename === "older.png" || f.filename === "newer.png")
    .map((f) => f.filename);
  expect(names).toEqual(["newer.png", "older.png"]);
});

test("deleteFile removes the row and returns true when one existed", () => {
  insertFile(meta("to-delete.png"));
  expect(deleteFile("to-delete.png")).toBe(true);
  expect(getFile("to-delete.png")).toBeNull();
});

test("deleteFile returns false when there was nothing to delete", () => {
  expect(deleteFile("never-existed.png")).toBe(false);
});
