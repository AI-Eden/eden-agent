import { deepStrictEqual, match, strictEqual } from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { DockerDoctorPort } from "@eden/coding-runtime";
import { decodeDockerDoctorReport } from "@eden/contracts";

import { runDockerDoctor } from "../src/doctor.ts";

const port: DockerDoctorPort = {
  inspect: async () => ({
    client: {
      status: "ready",
      value: {
        apiVersion: "1.51",
        architecture: "amd64",
        operatingSystem: "linux",
        version: "28.3.3",
      },
    },
    context: {
      status: "ready",
      value: { endpoint: "unix:///var/run/docker.sock", name: "default" },
    },
    daemon: {
      status: "ready",
      value: {
        apiVersion: "1.51",
        architecture: "amd64",
        cgroupVersion: "2",
        cpuCfsPeriod: true,
        cpuCfsQuota: true,
        memoryLimit: true,
        minApiVersion: "1.24",
        operatingSystem: "Docker Engine - Community",
        osType: "linux",
        pidsLimit: true,
        platformName: "Docker Engine - Community",
        securityOptions: ["name=seccomp,profile=builtin", "name=userns", "name=cgroupns"],
        serverVersion: "29.6.2",
        swapLimit: true,
      },
    },
    image: {
      status: "ready",
      value: {
        architecture: "amd64",
        configDigest: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
        entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
        indexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
        manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
        manifestEvidence: "frozen_config_mapping",
        operatingSystem: "linux",
        user: "65532:65532",
        workingDirectory: "/workspace",
      },
    },
    orphans: { status: "ready", value: [] },
  }),
};

function output() {
  let stderr = "";
  let stdout = "";
  return {
    environment: {
      cwd: "/workspace",
      io: {
        stderr: (value: string) => {
          stderr += value;
        },
        stdout: (value: string) => {
          stdout += value;
        },
      },
    },
    read: () => ({ stderr, stdout }),
  };
}

test("plain and JSON doctor surfaces project the same closed read-only rows", async () => {
  const stateDirectory = join(await mkdtemp(join(tmpdir(), "eden-doctor-cli-")), "missing-state");
  const jsonOutput = output();
  const jsonExit = await runDockerDoctor(
    { format: "json", mode: "doctor" },
    { ...jsonOutput.environment, port, stateDirectory },
  );
  const jsonReport = JSON.parse(jsonOutput.read().stdout);

  strictEqual(jsonExit, 0);
  strictEqual(jsonOutput.read().stderr, "");
  strictEqual(decodeDockerDoctorReport(jsonReport).ok, true);

  const plainOutput = output();
  const plainExit = await runDockerDoctor(
    { format: "plain", mode: "doctor" },
    { ...plainOutput.environment, port, stateDirectory },
  );
  strictEqual(plainExit, 0);
  strictEqual(plainOutput.read().stderr, "");
  match(plainOutput.read().stdout, /^doctor: read_only · mutation: none$/mu);
  for (const row of jsonReport.rows) {
    match(plainOutput.read().stdout, new RegExp(`^${row.id} · ${row.status}:`, "mu"));
  }
  deepStrictEqual(
    [...plainOutput.read().stdout.matchAll(/^docker\.[a-z]+|^eden\.state/gmu)].length,
    jsonReport.rows.length,
  );
});
