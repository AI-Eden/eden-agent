import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { rgPath } from "@vscode/ripgrep";

const distributionDirectory = "dist";
const applicationName = process.platform === "win32" ? "eden.exe" : "eden";
const ripgrepName = process.platform === "win32" ? "rg.exe" : "rg";

await rm(distributionDirectory, { force: true, recursive: true });
await mkdir(distributionDirectory, { recursive: true });

const arguments_ = ["build", "--compile", "src/index.ts"];
if (process.platform === "linux") {
  arguments_.push("--define", 'process.env.OPENTUI_LIBC="glibc"');
}
arguments_.push("--outfile", join(distributionDirectory, applicationName));

const result = spawnSync("bun", arguments_, { stdio: "inherit" });
if (result.error !== undefined) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  const applicationPath = join(distributionDirectory, applicationName);
  const ripgrepPath = join(distributionDirectory, ripgrepName);
  const noticesPath = join(distributionDirectory, "THIRD_PARTY_NOTICES.txt");
  await copyFile(rgPath, ripgrepPath);
  await copyFile("THIRD_PARTY_NOTICES.txt", noticesPath);
  if (process.platform !== "win32") {
    await chmod(applicationPath, 0o755);
    await chmod(ripgrepPath, 0o755);
  }
  const hash = async (path) =>
    `sha256:${createHash("sha256")
      .update(await readFile(path))
      .digest("hex")}`;
  const manifest = {
    application: { contentHash: await hash(applicationPath), path: applicationName },
    formatVersion: 1,
    notices: { contentHash: await hash(noticesPath), path: "THIRD_PARTY_NOTICES.txt" },
    ripgrep: {
      contentHash: await hash(ripgrepPath),
      package: "@vscode/ripgrep",
      packageVersion: "1.18.0",
      path: ripgrepName,
      version: "15.0.0",
    },
    target: { architecture: process.arch, platform: process.platform },
  };
  await writeFile(
    join(distributionDirectory, "eden-assets.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
