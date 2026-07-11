/**
 * Hits a real local Docling CLI install. Skipped unless RUN_INTEGRATION=1 and the
 * CLI is actually resolvable, and never part of the default `npm test` run (see
 * vitest.integration.config.ts).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupConversion, convertDocument } from "../../src/agent/docling.js";
import { config } from "../../src/config.js";

const RUN = process.env.RUN_INTEGRATION === "1";

function doclingAvailable(): boolean {
  try {
    execFileSync(config.doclingCliPath, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!RUN || !doclingAvailable())("docling (real CLI)", () => {
  it(
    "converts a tiny local HTML fixture into a DoclingDocument",
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "docling-integration-"));
      const file = path.join(dir, "sample.html");
      writeFileSync(file, "<html><body><h1>Hello</h1><p>World.</p></body></html>");

      const id = randomUUID();
      try {
        const { doc } = await convertDocument(file, id);
        expect(doc.schema_name).toBe("DoclingDocument");
        expect(JSON.stringify(doc)).toContain("Hello");
      } finally {
        await cleanupConversion(id);
      }
    },
    60000,
  );
});
