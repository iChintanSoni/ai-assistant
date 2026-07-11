import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AGENT_URL } from "./config";
import { acceptFor, fetchModels, isAcceptableOtherFile } from "./models";
import type { ModelInfo } from "./models";

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return { name: "m", modalities: ["text"], tools: true, thinking: false, contextLength: null, ...overrides };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("acceptFor returns an empty string when no model is selected", () => {
  expect(acceptFor(undefined)).toBe("");
});

test("acceptFor builds an accept string from image/audio modalities", () => {
  expect(acceptFor(model({ modalities: ["text", "image", "audio"] }))).toBe("image/*,audio/*");
  expect(acceptFor(model({ modalities: ["text"] }))).toBe("");
});

test("isAcceptableOtherFile requires both a model and a matching modality", () => {
  const png = new File([""], "a.png", { type: "image/png" });
  expect(isAcceptableOtherFile(png, undefined)).toBe(false);
  expect(isAcceptableOtherFile(png, model({ modalities: ["text"] }))).toBe(false);
  expect(isAcceptableOtherFile(png, model({ modalities: ["text", "image"] }))).toBe(true);

  const wav = new File([""], "a.wav", { type: "audio/wav" });
  expect(isAcceptableOtherFile(wav, model({ modalities: ["text", "audio"] }))).toBe(true);
});

test("fetchModels returns the parsed models response on success", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [], defaultModel: "m1" }), { status: 200 }));
  await expect(fetchModels()).resolves.toEqual({ models: [], defaultModel: "m1" });
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${AGENT_URL}/models`);
});

test("fetchModels throws a descriptive error on a non-ok response", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 502 }));
  await expect(fetchModels()).rejects.toThrow(/HTTP 502/);
});
