import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkSource = [
  'import { readlinkSync } from "node:fs";',
  'if (readlinkSync("/usr/local/bin/node") !== "/nodejs/bin/node") {',
  '  throw new Error("node_alias_mismatch");',
  "}",
  "process.stdout.write(Buffer.from([0xff, 0x00, 0x80, 0x0a]));",
  'process.stderr.write("fixture-stderr\\n");',
  "",
].join("\n");

const request = Object.freeze({
  actionId: "action-slice3-image-fixture",
  budgets: {
    stderrBytes: 16_384,
    stdoutBytes: 16_384,
    stopGraceMs: 2_000,
    timeoutMs: 30_000,
  },
  checkName: "test",
  effectId: "effect-slice3-image-fixture",
  inputManifestDigest: `sha256:${"1".repeat(64)}`,
  process: {
    arguments: ["check.mjs"],
    cwd: ".",
    executable: "/usr/local/bin/node",
  },
  requestVersion: 1,
  wrapperProtocolVersion: 1,
});

export async function prepareWrapperIntegrationFixture(destination) {
  const workspace = join(destination, "workspace");
  const control = join(destination, "request.json");
  const result = join(destination, "result.json");
  await mkdir(workspace, { mode: 0o700, recursive: true });
  await Promise.all([
    writeFile(join(workspace, "check.mjs"), checkSource, { flag: "wx", mode: 0o444 }),
    writeFile(control, `${JSON.stringify(request)}\n`, { flag: "wx", mode: 0o444 }),
    writeFile(result, "", { flag: "wx", mode: 0o666 }),
  ]);
  await Promise.all([
    chmod(join(workspace, "check.mjs"), 0o444),
    chmod(workspace, 0o555),
    chmod(control, 0o444),
    chmod(result, 0o666),
  ]);
  return { control, result, workspace };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (destination === undefined) throw new Error("fixture_destination_required");
  prepareWrapperIntegrationFixture(destination).then((paths) => {
    process.stdout.write(`${JSON.stringify(paths)}\n`);
  });
}
