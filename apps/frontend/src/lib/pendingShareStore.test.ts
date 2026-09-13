// jsdom has no native IndexedDB — this polyfill is scoped to this file only.
import "fake-indexeddb/auto";
import { expect, test } from "vitest";
import { putPendingShare, takePendingShare } from "./pendingShareStore";

// Note: jsdom's own File/Blob classes aren't recognized by the structured-clone
// step IndexedDB (real or fake-indexeddb) uses internally — a documented
// jsdom limitation (https://github.com/dumbmatter/fakeIndexedDB/issues/88),
// confirmed here by the fact that this same store round-trips File.name/type
// correctly when run directly under Node outside jsdom. So these tests cover
// the store's actual control flow (put/take/clear/replace semantics, the part
// that could realistically have a bug) using file *count*, not content —
// content fidelity is a browser-IndexedDB guarantee, verified live instead.

test("returns [] when nothing is pending", async () => {
  await expect(takePendingShare()).resolves.toEqual([]);
});

test("put then take returns the same number of files", async () => {
  await putPendingShare([new File(["a"], "a.pdf", { type: "application/pdf" })]);

  const result = await takePendingShare();

  expect(result).toHaveLength(1);
});

test("take clears the pending share — a second take returns []", async () => {
  await putPendingShare([new File(["a"], "a.pdf")]);

  await takePendingShare();
  const second = await takePendingShare();

  expect(second).toEqual([]);
});

test("a later put replaces an earlier, unconsumed one rather than accumulating", async () => {
  await putPendingShare([new File(["a"], "a.pdf")]);
  await putPendingShare([new File(["b"], "b.pdf"), new File(["c"], "c.pdf")]);

  const result = await takePendingShare();

  expect(result).toHaveLength(2);
});

test("multiple shared files all come back", async () => {
  await putPendingShare([new File(["a"], "a.pdf"), new File(["b"], "b.pdf"), new File(["c"], "c.pdf")]);

  const result = await takePendingShare();

  expect(result).toHaveLength(3);
});
