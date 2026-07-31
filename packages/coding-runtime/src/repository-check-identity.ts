import { createHash } from "node:crypto";

function canonicalJson(value: Readonly<Record<string, string>>): string {
  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${JSON.stringify(item)}`)
    .join(",")}}`;
}

export function repositoryCheckStagingIdentity(input: {
  readonly effectId: string;
  readonly inputManifestDigest: string;
  readonly runId: string;
}): string {
  return `sha256:${createHash("sha256")
    .update("eden.repository-check-staging.v1\0")
    .update(canonicalJson(input))
    .digest("hex")}`;
}
