import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadApplicationAssets } from "@eden/coding-runtime";
import { rgPath } from "@vscode/ripgrep";

function hash(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function archiveFixture() {
  const directory = await mkdtemp(join(tmpdir(), "eden-assets-"));
  const edenName = process.platform === "win32" ? "eden.exe" : "eden";
  const rgName = process.platform === "win32" ? "rg.exe" : "rg";
  const eden = Buffer.from("eden fixture");
  const notices = Buffer.from("third-party notices fixture\n");
  const rg = await readFile(rgPath);
  await writeFile(join(directory, edenName), eden);
  await copyFile(rgPath, join(directory, rgName));
  await writeFile(join(directory, "THIRD_PARTY_NOTICES.txt"), notices);
  if (process.platform !== "win32") await chmod(join(directory, rgName), 0o755);
  const manifest = {
    application: { contentHash: hash(eden), path: edenName },
    formatVersion: 1,
    notices: { contentHash: hash(notices), path: "THIRD_PARTY_NOTICES.txt" },
    ripgrep: {
      contentHash: hash(rg),
      package: "@vscode/ripgrep",
      packageVersion: "1.18.0",
      path: rgName,
      version: "15.0.0",
    },
    target: { architecture: process.arch, platform: process.platform },
  } as const;
  await writeFile(join(directory, "eden-assets.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest };
}

describe("application archive assets", () => {
  it("loads one closed target-specific application-relative ripgrep descriptor", async () => {
    const { directory, manifest } = await archiveFixture();

    const loaded = await loadApplicationAssets(directory);

    assert.equal(loaded.ripgrepAssetError, undefined);
    assert.deepEqual(loaded.ripgrepAsset, {
      contentHash: manifest.ripgrep.contentHash,
      path: join(await realpath(directory), manifest.ripgrep.path),
      version: "15.0.0",
    });
  });

  it("turns missing, malformed, extra-field, and wrong-target manifests into safe blockers", async () => {
    const missing = await mkdtemp(join(tmpdir(), "eden-assets-missing-"));
    assert.equal(
      (await loadApplicationAssets(missing)).ripgrepAssetError?.code,
      "ripgrep_asset_missing",
    );

    const malformed = await mkdtemp(join(tmpdir(), "eden-assets-malformed-"));
    await writeFile(join(malformed, "eden-assets.json"), "not-json\n");
    assert.equal(
      (await loadApplicationAssets(malformed)).ripgrepAssetError?.code,
      "ripgrep_asset_manifest_invalid",
    );

    const { directory, manifest } = await archiveFixture();
    await writeFile(
      join(directory, "eden-assets.json"),
      JSON.stringify({ ...manifest, executable: "/usr/bin/rg" }),
    );
    assert.equal(
      (await loadApplicationAssets(directory)).ripgrepAssetError?.code,
      "ripgrep_asset_manifest_invalid",
    );

    await writeFile(
      join(directory, "eden-assets.json"),
      JSON.stringify({
        ...manifest,
        target: { ...manifest.target, platform: process.platform === "linux" ? "darwin" : "linux" },
      }),
    );
    const wrongTarget = await loadApplicationAssets(directory);
    assert.equal(wrongTarget.ripgrepAssetError?.code, "ripgrep_asset_wrong_target");
    assert.equal(JSON.stringify(wrongTarget).includes(directory), false);
  });
});
