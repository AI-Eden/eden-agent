import { createHash } from "node:crypto";

import type { ProductError, RepositoryCheckDockerCompatibilityV1 } from "@eden/contracts";

import type { DockerDoctorObservation } from "./docker-doctor.ts";
import {
  repositoryCheckToolchainConfigDigests,
  repositoryCheckToolchainManifest,
} from "./repository-check-toolchain.ts";

export type RepositoryCheckDockerCompatibilityResult =
  | { readonly ok: true; readonly value: RepositoryCheckDockerCompatibilityV1 }
  | { readonly error: ProductError; readonly ok: false };

function versionAtLeast(actual: string, minimum: string): boolean {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)$/u.exec(value);
    return match === null ? null : ([Number(match[1]), Number(match[2])] as const);
  };
  const left = parse(actual);
  const right = parse(minimum);
  return (
    left !== null &&
    right !== null &&
    (left[0] > right[0] || (left[0] === right[0] && left[1] >= right[1]))
  );
}

function blocked(reason: string): RepositoryCheckDockerCompatibilityResult {
  return {
    error: {
      code: "repository_check_docker_incompatible",
      message: `The Docker backend cannot satisfy the closed repository-check contract: ${reason}`,
      recoverability: "reconfigure",
      suggestedActions: ["Run eden doctor against the selected safe Docker context."],
    },
    ok: false,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function repositoryCheckDockerEndpointSha256(endpoint: string): string {
  return `sha256:${createHash("sha256").update(endpoint).digest("hex")}`;
}

export function observeRepositoryCheckDockerCompatibility(
  observation: DockerDoctorObservation,
): RepositoryCheckDockerCompatibilityResult {
  if (
    observation.client.status !== "ready" ||
    observation.context.status !== "ready" ||
    observation.daemon.status !== "ready" ||
    observation.image.status !== "ready"
  ) {
    return blocked("a required observation is unavailable");
  }
  const { client, context, daemon, image } = {
    client: observation.client.value,
    context: observation.context.value,
    daemon: observation.daemon.value,
    image: observation.image.value,
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(context.name)) {
    return blocked("the selected context name is not safe");
  }
  if (!/^(?:unix|npipe|tcp):\/\//u.test(context.endpoint)) {
    return blocked("the selected context endpoint scheme is unsupported");
  }
  if (
    !versionAtLeast(client.apiVersion, "1.43") ||
    !versionAtLeast(daemon.apiVersion, "1.43") ||
    !versionAtLeast(client.apiVersion, daemon.minApiVersion) ||
    !versionAtLeast(daemon.apiVersion, daemon.minApiVersion)
  ) {
    return blocked("the client and daemon API versions do not satisfy the frozen floor");
  }
  if (
    daemon.osType !== "linux" ||
    (daemon.architecture !== "amd64" && daemon.architecture !== "arm64")
  ) {
    return blocked("the daemon is not a supported Linux-container backend");
  }
  const platform = `linux/${daemon.architecture}` as const;
  const expectedManifest = repositoryCheckToolchainManifest.platforms.find(
    (candidate) => candidate.platform === platform,
  );
  if (
    expectedManifest === undefined ||
    image.indexDigest !== repositoryCheckToolchainManifest.imageIndexDigest ||
    image.manifestDigest !== expectedManifest.manifestDigest ||
    image.configDigest !== repositoryCheckToolchainConfigDigests[platform] ||
    image.operatingSystem !== "linux" ||
    image.architecture !== daemon.architecture ||
    image.user !== "65532:65532" ||
    image.workingDirectory !== repositoryCheckToolchainManifest.paths.workspace ||
    image.entrypoint.length !== 2 ||
    image.entrypoint[0] !== "/nodejs/bin/node" ||
    image.entrypoint[1] !== repositoryCheckToolchainManifest.paths.wrapper
  ) {
    return blocked("the exact local toolchain image identity or profile is mismatched");
  }
  const seccomp = daemon.securityOptions.some((value) => value.startsWith("name=seccomp"));
  const userNamespace = daemon.securityOptions.includes("name=userns");
  const cgroupNamespace = daemon.securityOptions.includes("name=cgroupns");
  if (
    !seccomp ||
    !userNamespace ||
    !cgroupNamespace ||
    !daemon.memoryLimit ||
    !daemon.swapLimit ||
    !daemon.cpuCfsPeriod ||
    !daemon.cpuCfsQuota ||
    !daemon.pidsLimit
  ) {
    return blocked("a required namespace, security, or resource feature is unavailable");
  }
  return {
    ok: true,
    value: {
      client: { apiVersion: client.apiVersion, version: client.version },
      compatibilityVersion: 1,
      context: {
        endpointSha256: repositoryCheckDockerEndpointSha256(context.endpoint),
        name: context.name,
      },
      daemon: {
        apiVersion: daemon.apiVersion,
        architecture: daemon.architecture,
        minimumApiVersion: daemon.minApiVersion,
        osType: "linux",
        version: daemon.serverVersion,
      },
      features: {
        cgroupNamespace: true,
        cpuCfsPeriod: true,
        cpuCfsQuota: true,
        memoryLimit: true,
        pidsLimit: true,
        seccomp: true,
        swapLimit: true,
        userNamespace: true,
      },
      image: {
        architecture: daemon.architecture,
        configDigest: image.configDigest,
        indexDigest: image.indexDigest,
        manifestDigest: image.manifestDigest,
        manifestEvidence: image.manifestEvidence,
        operatingSystem: "linux",
      },
    },
  };
}

export function repositoryCheckDockerCompatibilityMatches(
  approved: RepositoryCheckDockerCompatibilityV1,
  observed: RepositoryCheckDockerCompatibilityV1,
): boolean {
  return canonicalJson(approved) === canonicalJson(observed);
}
