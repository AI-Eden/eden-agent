import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  candidatePackageIds,
  getCandidatePackageConfig,
  measurementVersions,
  packagingVersions,
} from "../src/package-config.ts";

describe("terminal candidate package configuration", () => {
  it("keeps the approved candidate matrix exhaustive", () => {
    // Given the public plan names three deployment combinations.
    // When the packaging harness exposes its supported candidate IDs.
    // Then every approved combination is present in stable order.
    assert.deepEqual(candidatePackageIds, ["ink-node", "ink-bun", "opentui-bun"]);
  });

  it("uses the same Ink entrypoint for Node and Bun", () => {
    // Given runtime packaging must not change the evaluated UI source graph.
    // When both Ink package configurations are resolved.
    const nodeConfig = getCandidatePackageConfig("ink-node");
    const bunConfig = getCandidatePackageConfig("ink-bun");

    // Then both runtimes package the same source entrypoint from the same workspace.
    assert.equal(nodeConfig.packageDirectory, bunConfig.packageDirectory);
    assert.equal(nodeConfig.entrypoint, bunConfig.entrypoint);
    assert.equal(nodeConfig.runtime, "node");
    assert.equal(bunConfig.runtime, "bun");
  });

  it("records the OpenTUI native embedding requirement", () => {
    // Given OpenTUI selects a platform-native library during compilation.
    // When its Bun package configuration is resolved.
    const config = getCandidatePackageConfig("opentui-bun");

    // Then the configuration makes native embedding explicit.
    assert.equal(config.runtime, "bun");
    assert.equal(config.nativeEmbedding, "opentui");
  });

  it("uses shell-independent Bun test discovery for OpenTUI", () => {
    const packageManifest = JSON.parse(
      readFileSync(new URL("../../opentui/package.json", import.meta.url), "utf8"),
    ) as { readonly scripts: Readonly<Record<string, string>> };

    assert.equal(packageManifest.scripts.test, "bun test ./test");
    assert.equal(packageManifest.scripts["test:bun"], "bun test ./test");
  });

  it("preserves the accepted measurement toolchain", () => {
    assert.deepEqual(measurementVersions, {
      bun: "1.3.14",
      node: "v24.15.0",
      pnpm: "11.7.0",
    });
  });

  it("pins every runtime used by current local and hosted packaging", () => {
    assert.deepEqual(packagingVersions, {
      bun: "1.3.14",
      node: "v24.15.0",
      pnpm: "11.13.0",
    });
  });
});
