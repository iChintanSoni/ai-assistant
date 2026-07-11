/**
 * Hits a real local Ollama instance. Skipped unless RUN_INTEGRATION=1, and never
 * part of the default `npm test` run (see vitest.integration.config.ts).
 */
import { describe, expect, it } from "vitest";
import { describeModel, listModels } from "../../src/agent/models.js";
import { config } from "../../src/config.js";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!RUN)("models (live Ollama)", () => {
  it(`lists models from a real Ollama at ${config.ollamaBaseUrl} without throwing`, async () => {
    const models = await listModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it("describeModel resolves real capabilities for the configured default model", async () => {
    const info = await describeModel(config.defaultModel);
    expect(typeof info.eligible).toBe("boolean");
  });
});
