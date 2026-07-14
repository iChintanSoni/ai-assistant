import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../lib/modelManagement", async () => {
  const actual = await vi.importActual<typeof import("../lib/modelManagement")>("../lib/modelManagement");
  return {
    isOrchestratorEligible: actual.isOrchestratorEligible,
    isImageGenEligible: actual.isImageGenEligible,
    isEmbeddingEligible: actual.isEmbeddingEligible,
    fetchAllModels: vi.fn(),
    setDefaultModel: vi.fn(),
    setImageGenModel: vi.fn(),
    setEmbeddingModel: vi.fn(),
    deleteModel: vi.fn(),
    pullModel: vi.fn(),
  };
});

import {
  deleteModel,
  fetchAllModels,
  pullModel,
  setDefaultModel,
  setEmbeddingModel,
  setImageGenModel,
} from "../lib/modelManagement";
import type { ModelSummary } from "../lib/modelManagement";
import { useThemeStore } from "../store/theme";
import { SettingsPage } from "./SettingsPage";

function model(overrides: Partial<ModelSummary> = {}): ModelSummary {
  return {
    name: "alpha:latest",
    size: 1024 * 1024 * 1024,
    modifiedAt: null,
    family: "llama",
    parameterSize: "8B",
    quantizationLevel: "Q4_K_M",
    capabilities: ["completion", "tools"],
    contextLength: 8192,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchAllModels)
    .mockReset()
    .mockResolvedValue({ models: [], defaultModel: "", imageGenModel: "", embeddingModel: "" });
  vi.mocked(setDefaultModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(setImageGenModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(setEmbeddingModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(pullModel).mockReset();
  useThemeStore.setState({ preference: "auto", resolved: "light" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("shows the appearance radiogroup reflecting the current preference", async () => {
  render(<SettingsPage />);
  expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
});

test("clicking an appearance option updates the theme store", async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);

  await user.click(screen.getByRole("radio", { name: "Dark" }));

  expect(useThemeStore.getState().preference).toBe("dark");
});

test("shows a load error when fetching models fails", async () => {
  vi.mocked(fetchAllModels).mockRejectedValue(new Error("network down"));
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
});

test("shows an empty-state message when no models are installed", async () => {
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText(/No models installed/)).toBeInTheDocument());
});

test("lists installed models with size, capability badges, and the default marker", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" })],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  render(<SettingsPage />);

  await waitFor(() => expect(screen.getByText("alpha:latest")).toBeInTheDocument());
  expect(screen.getByText("Text Generation Model")).toBeInTheDocument();
  expect(screen.getByText("1.0 GB")).toBeInTheDocument();
  expect(screen.getByText("tools")).toBeInTheDocument();
  expect(screen.getByText("Default")).toBeInTheDocument();
});

test("the search box filters the model list by name", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" }), model({ name: "beta:latest" })],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  const user = userEvent.setup();
  render(<SettingsPage />);

  await waitFor(() => expect(screen.getByText("alpha:latest")).toBeInTheDocument());
  expect(screen.getByText("beta:latest")).toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: /search models/i }), "alpha");

  expect(screen.getByText("alpha:latest")).toBeInTheDocument();
  expect(screen.queryByText("beta:latest")).not.toBeInTheDocument();
});

test("clicking the star on a non-default model sets it as the orchestration default", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" }), model({ name: "beta:latest" })],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("beta:latest")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Set beta:latest as the orchestration default" }));

  expect(setDefaultModel).toHaveBeenCalledWith("beta:latest");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "beta:latest is the orchestration default" })).toBeInTheDocument(),
  );
});

test("the orchestration default's star button is disabled", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" })],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  render(<SettingsPage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "alpha:latest is the orchestration default" })).toBeDisabled(),
  );
});

test("an image-generation model appears in its own section with a photo action, and setting it persists", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [
      model({ name: "alpha:latest" }),
      model({ name: "z-image:latest", capabilities: ["image"] }),
    ],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("Image Generation Model")).toBeInTheDocument());
  expect(screen.getByText("image-gen")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Set z-image:latest as the image-generation default" }));

  expect(setImageGenModel).toHaveBeenCalledWith("z-image:latest");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "z-image:latest is the image-generation default" }),
    ).toBeInTheDocument(),
  );
  // Chat models never get an image-generation action, even in the same list.
  expect(screen.queryByRole("button", { name: /alpha:latest.*image-generation/ })).not.toBeInTheDocument();
});

test("an embedding model appears under Embedding Models with a settable default action", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [
      model({ name: "alpha:latest" }),
      model({ name: "nomic-embed-text:latest", capabilities: ["embedding"] }),
    ],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("Embedding Models")).toBeInTheDocument());
  expect(screen.getByText("embedding")).toBeInTheDocument();
  // Chat models never get an embedding action, even in the same list.
  expect(screen.queryByRole("button", { name: /alpha:latest.*embedding/ })).not.toBeInTheDocument();
});

test("changing the embedding default requires a confirming second click, with a warning shown in between", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "nomic-embed-text:latest", capabilities: ["embedding"] })],
    defaultModel: "",
    imageGenModel: "",
    embeddingModel: "",
  });
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("nomic-embed-text:latest")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Set nomic-embed-text:latest as the embedding default" }));

  expect(setEmbeddingModel).not.toHaveBeenCalled();
  expect(screen.getByText(/existing documents won't be searchable/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Confirm nomic-embed-text:latest as the embedding default" }));

  expect(setEmbeddingModel).toHaveBeenCalledWith("nomic-embed-text:latest");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "nomic-embed-text:latest is the embedding default" }),
    ).toBeInTheDocument(),
  );
});

test("a model with neither orchestration, image-gen, nor embedding capabilities appears nowhere in Settings", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" }), model({ name: "mystery:latest", capabilities: [] })],
    defaultModel: "alpha:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("alpha:latest")).toBeInTheDocument());

  expect(screen.queryByText("mystery:latest")).not.toBeInTheDocument();
  expect(screen.queryByText("Image Generation Model")).not.toBeInTheDocument();
  expect(screen.queryByText("Embedding Models")).not.toBeInTheDocument();
});

test("delete requires a confirming second click, then removes the model", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" })],
    defaultModel: "other:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("alpha:latest")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "alpha:latest"' }));
  expect(screen.getByRole("button", { name: 'Confirm delete "alpha:latest"' })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Confirm delete "alpha:latest"' }));

  expect(deleteModel).toHaveBeenCalledWith("alpha:latest");
  await waitFor(() => expect(screen.queryByText("alpha:latest")).not.toBeInTheDocument());
});

test("a failed delete shows an error message and restores the list", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "alpha:latest" })],
    defaultModel: "other:latest",
    imageGenModel: "",
    embeddingModel: "",
  });
  vi.mocked(deleteModel).mockRejectedValue(new Error("delete failed"));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText("alpha:latest")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: 'Delete "alpha:latest"' }));
  await user.click(screen.getByRole("button", { name: 'Confirm delete "alpha:latest"' }));

  await waitFor(() => expect(screen.getByText("delete failed")).toBeInTheDocument());
  expect(screen.getByText("alpha:latest")).toBeInTheDocument();
});

test("downloading a model shows live progress, then clears and refreshes the list on success", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({ models: [], defaultModel: "", imageGenModel: "", embeddingModel: "" });
  let resolvePull: (() => void) | undefined;
  vi.mocked(pullModel).mockImplementation((_name, onProgress) => {
    onProgress({ status: "downloading", total: 100, completed: 25 });
    return new Promise((resolve) => {
      resolvePull = () => resolve(undefined);
    });
  });
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText(/No models installed/)).toBeInTheDocument());

  await user.type(screen.getByRole("textbox", { name: /model name to download/i }), "llama3.1:8b");
  await user.click(screen.getByRole("button", { name: "Download" }));

  expect(pullModel).toHaveBeenCalledWith("llama3.1:8b", expect.any(Function));
  await waitFor(() => expect(screen.getByText("25%")).toBeInTheDocument());

  vi.mocked(fetchAllModels).mockResolvedValue({
    models: [model({ name: "llama3.1:8b" })],
    defaultModel: "llama3.1:8b",
    imageGenModel: "",
    embeddingModel: "",
  });
  resolvePull!();

  await waitFor(() => expect(screen.queryByText("25%")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("llama3.1:8b")).toBeInTheDocument());
});

test("a failed download shows an error message", async () => {
  vi.mocked(fetchAllModels).mockResolvedValue({ models: [], defaultModel: "", imageGenModel: "", embeddingModel: "" });
  vi.mocked(pullModel).mockRejectedValue(new Error("model not found"));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText(/No models installed/)).toBeInTheDocument());

  await user.type(screen.getByRole("textbox", { name: /model name to download/i }), "nope:latest");
  await user.click(screen.getByRole("button", { name: "Download" }));

  await waitFor(() => expect(screen.getByText("model not found")).toBeInTheDocument());
});
