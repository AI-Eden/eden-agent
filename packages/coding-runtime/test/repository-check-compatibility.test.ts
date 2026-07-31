import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { repositoryCheckActionFixture } from "../../contracts/test/repository-check-fixture.ts";
import type { DockerDoctorObservation } from "../src/docker-doctor.ts";
import { safeActionDigest } from "../src/policy/index.ts";
import {
  observeRepositoryCheckDockerCompatibility,
  repositoryCheckDockerCompatibilityMatches,
  repositoryCheckDockerEndpointSha256,
} from "../src/repository-check-compatibility.ts";

const readyObservation = {
  client: {
    status: "ready",
    value: {
      apiVersion: "1.51",
      architecture: "amd64",
      operatingSystem: "linux",
      version: "29.6.2",
    },
  },
  context: {
    status: "ready",
    value: { endpoint: "unix:///tmp/private-docker.sock", name: "eden-r2-safe" },
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
} satisfies DockerDoctorObservation;

describe("repository-check Docker compatibility", () => {
  it("derives one bounded closed identity without retaining the raw endpoint", () => {
    const result = observeRepositoryCheckDockerCompatibility(readyObservation);
    strictEqual(result.ok, true);
    if (!result.ok) return;
    deepStrictEqual(result.value.context, {
      endpointSha256: repositoryCheckDockerEndpointSha256(readyObservation.context.value.endpoint),
      name: "eden-r2-safe",
    });
    strictEqual(JSON.stringify(result.value).includes("private-docker.sock"), false);
  });

  it("blocks unavailable, unsafe, mismatched, or under-featured observations", () => {
    for (const observation of [
      { ...readyObservation, context: { status: "missing" as const } },
      {
        ...readyObservation,
        context: { ...readyObservation.context, value: { endpoint: "ssh://host", name: "safe" } },
      },
      {
        ...readyObservation,
        daemon: {
          ...readyObservation.daemon,
          value: { ...readyObservation.daemon.value, pidsLimit: false },
        },
      },
      {
        ...readyObservation,
        image: {
          ...readyObservation.image,
          value: { ...readyObservation.image.value, configDigest: `sha256:${"0".repeat(64)}` },
        },
      },
    ] satisfies readonly DockerDoctorObservation[]) {
      strictEqual(observeRepositoryCheckDockerCompatibility(observation).ok, false);
    }
  });

  it("requires every approved field to remain exactly equal", () => {
    const result = observeRepositoryCheckDockerCompatibility(readyObservation);
    strictEqual(result.ok, true);
    if (!result.ok) return;
    strictEqual(repositoryCheckDockerCompatibilityMatches(result.value, result.value), true);
    strictEqual(
      repositoryCheckDockerCompatibilityMatches(result.value, {
        ...result.value,
        daemon: { ...result.value.daemon, version: "29.6.3" },
      }),
      false,
    );
  });

  it("binds every compatibility observation into the canonical approval digest", () => {
    const original = safeActionDigest(repositoryCheckActionFixture);
    for (const dockerCompatibility of [
      {
        ...repositoryCheckActionFixture.dockerCompatibility,
        client: {
          ...repositoryCheckActionFixture.dockerCompatibility.client,
          version: "29.6.3",
        },
      },
      {
        ...repositoryCheckActionFixture.dockerCompatibility,
        context: {
          ...repositoryCheckActionFixture.dockerCompatibility.context,
          endpointSha256: `sha256:${"f".repeat(64)}`,
        },
      },
    ]) {
      strictEqual(
        safeActionDigest({ ...repositoryCheckActionFixture, dockerCompatibility }) === original,
        false,
      );
    }
  });
});
