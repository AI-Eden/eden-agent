import { join } from "node:path";

export function resolveBunExecutable(
  candidateRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? join(candidateRoot, "node_modules", "bun", "bin", "bun.exe")
    : join(candidateRoot, "node_modules", ".bin", "bun");
}
