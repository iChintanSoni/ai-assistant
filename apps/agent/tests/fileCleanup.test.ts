import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../src/config.js";

vi.mock("../src/agent/historyStore.js", () => ({
  getAllTranscripts: vi.fn(),
}));

import { getAllTranscripts } from "../src/agent/historyStore.js";
import { deleteConversationFiles, sweepOrphanFiles } from "../src/agent/fileCleanup.js";

const mockGetAllTranscripts = vi.mocked(getAllTranscripts);

beforeEach(() => {
  mockGetAllTranscripts.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("deleteConversationFiles deletes a file referenced only by the deleted conversation", async () => {
  const url = `${config.fileStorageBaseUrl}/files/abc.png`;
  mockGetAllTranscripts.mockReturnValue([]);
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

  await deleteConversationFiles([{ role: "agent", text: `here: ${url}` }]);

  expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "DELETE" }));
});

test("deleteConversationFiles keeps a file still referenced by a surviving conversation", async () => {
  const url = `${config.fileStorageBaseUrl}/files/shared.png`;
  mockGetAllTranscripts.mockReturnValue([[{ role: "agent", text: `still here: ${url}` }]]);
  const fetchMock = vi.mocked(fetch);

  await deleteConversationFiles([{ role: "agent", text: `here: ${url}` }]);

  expect(fetchMock).not.toHaveBeenCalled();
});

test("deleteConversationFiles is a no-op when the deleted turns reference no files", async () => {
  mockGetAllTranscripts.mockReturnValue([]);
  const fetchMock = vi.mocked(fetch);

  await deleteConversationFiles([{ role: "user", text: "hello" }]);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockGetAllTranscripts).not.toHaveBeenCalled();
});

test("sweepOrphanFiles deletes files past the grace period that no transcript references", async () => {
  const fetchMock = vi.mocked(fetch);
  const oldFile = { filename: "old.png", createdAt: Date.now() - 25 * 60 * 60 * 1000 };
  const recentFile = { filename: "recent.png", createdAt: Date.now() };
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith("/files")) {
      return new Response(JSON.stringify({ files: [oldFile, recentFile] }), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
  mockGetAllTranscripts.mockReturnValue([]);

  await sweepOrphanFiles();

  expect(fetchMock).toHaveBeenCalledWith(
    `${config.fileStorageBaseUrl}/files/old.png`,
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(fetchMock).not.toHaveBeenCalledWith(`${config.fileStorageBaseUrl}/files/recent.png`, expect.anything());
});

test("sweepOrphanFiles does nothing (and doesn't throw) when the files listing request fails", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

  await expect(sweepOrphanFiles()).resolves.toBeUndefined();
  expect(mockGetAllTranscripts).not.toHaveBeenCalled();
});

test("sweepOrphanFiles swallows a thrown error instead of rejecting", async () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockRejectedValue(new Error("network down"));

  await expect(sweepOrphanFiles()).resolves.toBeUndefined();
});
