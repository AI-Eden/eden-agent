import { strictEqual } from "node:assert";
import { test } from "node:test";
import { decodeDockerDiagnosticProbeEvent } from "@eden/contracts";
import {
  type DockerDoctorObservation,
  dockerDiagnosticProbeActionDigest,
  dockerDiagnosticProbeProgramIdentity,
  prepareDockerDiagnosticProbeApproval,
} from "../src/index.ts";

const observation: DockerDoctorObservation = {
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
};

const identity = {
  actionId: "action-docker-probe-1",
  approvalId: "approval-probe-1",
  eventId: "event-probe-approval-1",
  probeId: "probe-example-1",
  revision: 1,
} as const;

if (observation.daemon.status !== "ready" || observation.image.status !== "ready") {
  throw new Error("The literal preflight fixture must stay ready.");
}
const readyDaemon = observation.daemon.value;
const readyImage = observation.image.value;

test("read-only preflight binds exact backend, image, program, and always-ask approval", () => {
  const prepared = prepareDockerDiagnosticProbeApproval({
    identity,
    observedAt: "2026-07-31T00:00:00.000Z",
    observation,
  });

  strictEqual(prepared.ok, true);
  if (!prepared.ok) return;
  strictEqual(decodeDockerDiagnosticProbeEvent(prepared.event).ok, true);
  strictEqual(
    prepared.event.actionDigest,
    dockerDiagnosticProbeActionDigest(prepared.event.action),
  );
  strictEqual(
    prepared.event.action.toolchain.probeProgramSha256,
    dockerDiagnosticProbeProgramIdentity.sha256,
  );
  strictEqual(
    prepared.event.action.toolchain.probeProgramBytes,
    dockerDiagnosticProbeProgramIdentity.byteLength,
  );
  strictEqual(JSON.stringify(prepared.event).includes("unix:///var/run/docker.sock"), false);
});

test("read-only preflight blocks backend, security, resource, and image drift", () => {
  const changed = [
    { ...observation, context: { status: "malformed" as const } },
    {
      ...observation,
      daemon: {
        ...observation.daemon,
        value: { ...readyDaemon, osType: "windows" },
      },
    },
    {
      ...observation,
      daemon: {
        ...observation.daemon,
        value: { ...readyDaemon, securityOptions: ["name=seccomp"] },
      },
    },
    {
      ...observation,
      daemon: {
        ...observation.daemon,
        value: { ...readyDaemon, memoryLimit: false },
      },
    },
    {
      ...observation,
      image: {
        ...observation.image,
        value: { ...readyImage, manifestDigest: `sha256:${"9".repeat(64)}` },
      },
    },
    {
      ...observation,
      image: {
        ...observation.image,
        value: { ...readyImage, configDigest: `sha256:${"8".repeat(64)}` },
      },
    },
  ];
  for (const drift of changed) {
    strictEqual(
      prepareDockerDiagnosticProbeApproval({
        identity,
        observedAt: "2026-07-31T00:00:00.000Z",
        observation: drift,
      }).ok,
      false,
    );
  }
});
