import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProductionDependencyGraph } from "../src/package-evidence.ts";

describe("package dependency evidence", () => {
  it("normalizes resolved production dependencies with versions", () => {
    // Given pnpm reports nested required and optional production dependencies.
    const output = JSON.stringify([
      {
        dependencies: {
          alpha: {
            dependencies: { beta: { version: "2.0.0" } },
            version: "1.0.0",
          },
        },
        optionalDependencies: { gamma: { version: "3.0.0" } },
      },
    ]);

    // When the packaging harness normalizes the resolved graph.
    const graph = parseProductionDependencyGraph(output);

    // Then each resolved package is versioned, unique, and stable for comparison.
    assert.deepEqual(graph, [
      { name: "alpha", version: "1.0.0" },
      { name: "beta", version: "2.0.0" },
      { name: "gamma", version: "3.0.0" },
    ]);
  });
});
