import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";

import type { ProductError } from "@eden/contracts";

import type { RepositoryToolServiceOptions } from "./tools/index.ts";

const manifestByteLimit = 16_384;
const contentHashPattern = /^sha256:[a-f0-9]{64}$/u;

export type ApplicationAssets = Pick<
  RepositoryToolServiceOptions,
  "ripgrepAsset" | "ripgrepAssetError"
>;

function assetError(code: string, message: string): ProductError {
  return {
    code,
    message,
    recoverability: "reconfigure",
    suggestedActions: ["Restore the complete Eden archive and recheck repository prerequisites."],
  };
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validFile(value: unknown, path: string): boolean {
  return (
    record(value) &&
    exactKeys(value, ["contentHash", "path"]) &&
    value.path === path &&
    typeof value.contentHash === "string" &&
    contentHashPattern.test(value.contentHash)
  );
}

function decodeManifest(
  value: unknown,
):
  | { readonly contentHash: string; readonly path: string; readonly version: "15.0.0" }
  | "invalid"
  | "wrong-target" {
  if (
    !record(value) ||
    !exactKeys(value, ["application", "formatVersion", "notices", "ripgrep", "target"]) ||
    value.formatVersion !== 1 ||
    !validFile(value.application, process.platform === "win32" ? "eden.exe" : "eden") ||
    !validFile(value.notices, "THIRD_PARTY_NOTICES.txt") ||
    !record(value.ripgrep) ||
    !exactKeys(value.ripgrep, ["contentHash", "package", "packageVersion", "path", "version"]) ||
    value.ripgrep.path !== (process.platform === "win32" ? "rg.exe" : "rg") ||
    value.ripgrep.package !== "@vscode/ripgrep" ||
    value.ripgrep.packageVersion !== "1.18.0" ||
    value.ripgrep.version !== "15.0.0" ||
    typeof value.ripgrep.contentHash !== "string" ||
    !contentHashPattern.test(value.ripgrep.contentHash) ||
    !record(value.target) ||
    !exactKeys(value.target, ["architecture", "platform"]) ||
    typeof value.target.architecture !== "string" ||
    typeof value.target.platform !== "string"
  ) {
    return "invalid";
  }
  if (value.target.architecture !== process.arch || value.target.platform !== process.platform) {
    return "wrong-target";
  }
  return {
    contentHash: value.ripgrep.contentHash,
    path: process.platform === "win32" ? "rg.exe" : "rg",
    version: "15.0.0",
  };
}

export async function loadApplicationAssets(
  applicationDirectory: string,
): Promise<ApplicationAssets> {
  const missing = (): ApplicationAssets => ({
    ripgrepAssetError: assetError(
      "ripgrep_asset_missing",
      "The Eden archive asset manifest is missing.",
    ),
  });
  let directory: string;
  try {
    directory = await realpath(applicationDirectory);
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return missing();
  } catch {
    return missing();
  }
  const manifestPath = join(directory, "eden-assets.json");
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    const before = await lstat(manifestPath);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size <= 0 ||
      before.size > manifestByteLimit
    ) {
      return missing();
    }
    handle = await open(manifestPath, "r");
  } catch {
    return missing();
  }
  let value: unknown;
  try {
    const bytes = await handle.readFile();
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return {
      ripgrepAssetError: assetError(
        "ripgrep_asset_manifest_invalid",
        "The Eden archive asset manifest is invalid.",
      ),
    };
  } finally {
    await handle.close();
  }
  const decoded = decodeManifest(value);
  if (decoded === "invalid") {
    return {
      ripgrepAssetError: assetError(
        "ripgrep_asset_manifest_invalid",
        "The Eden archive asset manifest is invalid.",
      ),
    };
  }
  if (decoded === "wrong-target") {
    return {
      ripgrepAssetError: assetError(
        "ripgrep_asset_wrong_target",
        "The Eden archive assets target a different platform or architecture.",
      ),
    };
  }
  return {
    ripgrepAsset: {
      contentHash: decoded.contentHash,
      path: join(directory, decoded.path),
      version: decoded.version,
    },
  };
}
