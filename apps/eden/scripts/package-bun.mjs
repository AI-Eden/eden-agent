import { spawnSync } from "node:child_process";

const arguments_ = ["build", "--compile", "src/index.ts"];
if (process.platform === "linux") {
  arguments_.push("--define", 'process.env.OPENTUI_LIBC="glibc"');
}
arguments_.push("--outfile", process.platform === "win32" ? "dist/eden.exe" : "dist/eden");

const result = spawnSync("bun", arguments_, { stdio: "inherit" });
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
