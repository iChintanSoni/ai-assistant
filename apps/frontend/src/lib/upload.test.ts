import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FILE_STORAGE_URL } from "./config";
import { uploadFile } from "./upload";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uploadFile posts multipart form data and returns the parsed result", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ url: "u", filename: "f", size: 1, mimetype: "image/png" }), { status: 200 }),
  );
  const file = new File(["x"], "a.png", { type: "image/png" });

  const result = await uploadFile(file);

  expect(result).toEqual({ url: "u", filename: "f", size: 1, mimetype: "image/png" });
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe(`${FILE_STORAGE_URL}/upload`);
  expect((init as RequestInit).method).toBe("POST");
});

test("uploadFile throws a connectivity error when fetch itself throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network error"));
  await expect(uploadFile(new File(["x"], "a.png"))).rejects.toThrow(/Could not reach the file-storage service/);
});

test("uploadFile surfaces the server's error message on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "too big" }), { status: 413 }));
  await expect(uploadFile(new File(["x"], "a.png"))).rejects.toThrow("too big");
});

test("uploadFile falls back to a generic message when the error body isn't JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 500 }));
  await expect(uploadFile(new File(["x"], "a.png"))).rejects.toThrow(/HTTP 500/);
});
