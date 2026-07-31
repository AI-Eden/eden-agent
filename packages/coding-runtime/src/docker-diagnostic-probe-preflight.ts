import { createHash } from "node:crypto";

import {
  type DockerDiagnosticProbeActionV1,
  type DockerDiagnosticProbeApprovalRequiredV1,
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeEvent,
  type ProductError,
} from "@eden/contracts";
import { dockerDiagnosticProbeProgramIdentity } from "./docker-diagnostic-probe-program.ts";
import type { DockerDoctorObservation } from "./docker-doctor.ts";
import {
  dockerDiagnosticProbeActionDigest,
  evaluateDockerDiagnosticProbePolicy,
} from "./policy/index.ts";
import {
  repositoryCheckToolchainConfigDigests,
  repositoryCheckToolchainManifest,
} from "./repository-check-toolchain.ts";

export type DockerDiagnosticProbeIdentity = {
  readonly actionId: string;
  readonly approvalId: string;
  readonly eventId: string;
  readonly probeId: string;
  readonly revision: number;
};

export type DockerDiagnosticProbePreparation =
  | { readonly event: DockerDiagnosticProbeApprovalRequiredV1; readonly ok: true }
  | { readonly error: ProductError; readonly ok: false };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function domainHash(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0`)
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function error(code: string, message: string): ProductError {
  return {
    code,
    message,
    recoverability: "reconfigure",
    suggestedActions: ["Run read-only doctor and restore the exact frozen prerequisites."],
  };
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const parse = (value: string) => {
    const matched = /^(\d+)\.(\d+)$/u.exec(value);
    return matched === null ? null : ([Number(matched[1]), Number(matched[2])] as const);
  };
  const left = parse(actual);
  const right = parse(minimum);
  return (
    left !== null &&
    right !== null &&
    (left[0] > right[0] || (left[0] === right[0] && left[1] >= right[1]))
  );
}

export function prepareDockerDiagnosticProbeApproval(input: {
  readonly identity: DockerDiagnosticProbeIdentity;
  readonly observation: DockerDoctorObservation;
  readonly observedAt: string;
}): DockerDiagnosticProbePreparation {
  const { client, context, daemon, image } = input.observation;
  if (
    client.status !== "ready" ||
    context.status !== "ready" ||
    daemon.status !== "ready" ||
    image.status !== "ready"
  ) {
    return {
      error: error(
        "docker_probe_preflight_unavailable",
        "A required Docker preflight read is unavailable.",
      ),
      ok: false,
    };
  }
  const architecture =
    daemon.value.architecture === "amd64" || daemon.value.architecture === "arm64"
      ? daemon.value.architecture
      : null;
  const platform = architecture === null ? null : (`linux/${architecture}` as const);
  const expectedManifest = repositoryCheckToolchainManifest.platforms.find(
    (candidate) => candidate.platform === platform,
  );
  const apiReady =
    versionAtLeast(client.value.apiVersion, "1.43") &&
    versionAtLeast(daemon.value.apiVersion, "1.43") &&
    versionAtLeast(client.value.apiVersion, daemon.value.minApiVersion) &&
    versionAtLeast(daemon.value.apiVersion, daemon.value.minApiVersion);
  const securityReady =
    daemon.value.securityOptions.some((value) => value.startsWith("name=seccomp")) &&
    daemon.value.securityOptions.includes("name=userns") &&
    daemon.value.securityOptions.includes("name=cgroupns");
  const resourcesReady =
    daemon.value.cgroupVersion === "2" &&
    daemon.value.memoryLimit &&
    daemon.value.swapLimit &&
    daemon.value.cpuCfsPeriod &&
    daemon.value.cpuCfsQuota &&
    daemon.value.pidsLimit;
  const imageReady =
    platform !== null &&
    expectedManifest !== undefined &&
    image.value.indexDigest === repositoryCheckToolchainManifest.imageIndexDigest &&
    image.value.configDigest === repositoryCheckToolchainConfigDigests[platform] &&
    image.value.manifestDigest === expectedManifest.manifestDigest &&
    image.value.operatingSystem === "linux" &&
    image.value.architecture === architecture &&
    image.value.user === "65532:65532" &&
    image.value.workingDirectory === repositoryCheckToolchainManifest.paths.workspace &&
    JSON.stringify(image.value.entrypoint) ===
      JSON.stringify([
        repositoryCheckToolchainManifest.paths.nodeExecutable.replace(
          "/usr/local/bin/node",
          "/nodejs/bin/node",
        ),
        repositoryCheckToolchainManifest.paths.wrapper,
      ]);
  if (
    !apiReady ||
    daemon.value.osType !== "linux" ||
    architecture === null ||
    platform === null ||
    client.value.architecture !== architecture ||
    context.value.name.length === 0 ||
    !/^(?:unix|npipe|tcp):\/\//u.test(context.value.endpoint) ||
    !securityReady ||
    !resourcesReady ||
    !imageReady
  ) {
    return {
      error: error(
        "docker_probe_preflight_blocked",
        "The active Docker backend does not match the frozen diagnostic profile.",
      ),
      ok: false,
    };
  }

  const action: DockerDiagnosticProbeActionV1 = {
    actionId: input.identity.actionId,
    actionVersion: 1,
    authority: {
      environmentClass: "closed_non_secret",
      executionMode: "docker_container",
      isolation: "linux_container",
      network: "none",
      policyVersion: 1,
      remediation: "none",
      ruleSetRevision: "r2-docker-diagnostic-probe-v1",
    },
    backend: {
      architecture,
      clientApiVersion: client.value.apiVersion,
      contextEndpointSha256: domainHash("eden.docker-context-endpoint.v1", context.value.endpoint),
      contextName: context.value.name,
      daemonApiVersion: daemon.value.apiVersion,
      daemonIdentitySha256: domainHash("eden.docker-daemon-identity.v1", daemon.value),
      daemonMinimumApiVersion: daemon.value.minApiVersion,
      osType: "linux",
      serverVersion: daemon.value.serverVersion,
    },
    budgets: {
      cpuPeriodMicros: 100_000,
      cpuQuotaMicros: 50_000,
      fileDescriptors: 64,
      memoryBytes: 67_108_864,
      memorySwapBytes: 67_108_864,
      pids: 16,
      stderrBytes: 4_096,
      stdoutBytes: 4_096,
      stopGraceMs: 2_000,
      timeoutMs: 10_000,
      tmpfsBytes: 1_048_576,
    },
    kind: "docker_diagnostic_probe_v1",
    lifetime: {
      kind: "single_use_proposal_revision",
      revision: input.identity.revision,
    },
    operation: {
      checks: [
        "process_user",
        "user_namespace",
        "capabilities",
        "no_new_privileges",
        "seccomp",
        "root_filesystem",
        "temporary_filesystem",
        "resource_limits",
        "result_protocol",
      ],
      probeProtocolVersion: 1,
      programId: "eden-docker-diagnostic-probe-v1",
      type: "docker_diagnostic_probe_v1",
    },
    probeId: input.identity.probeId,
    profile: {
      autoRemove: false,
      capabilities: "drop_all",
      environment: {
        HOME: "/tmp",
        LANG: "C.UTF-8",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
      },
      entrypoint: "/nodejs/bin/node",
      hostNamespaces: "none",
      linuxUser: "65532:65532",
      network: "none",
      noNewPrivileges: true,
      privileged: false,
      profileRevision: "r2-docker-diagnostic-probe-v1",
      restart: "disabled",
      rootFilesystem: "read_only",
      seccomp: "docker_default",
      sockets: "none",
      temporaryFilesystem: {
        access: "read_write",
        containerPath: "/tmp",
        filesystem: "tmpfs",
        options: ["nodev", "noexec", "nosuid"],
      },
      workingDirectory: "/tmp",
    },
    proposalRevision: input.identity.revision,
    scope: {
      capability: "docker.diagnostic.probe",
      paths: "none",
      repository: "none",
    },
    toolchain: {
      imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
      nodeExecutable: "/nodejs/bin/node",
      nodeMajor: 24,
      platformManifestDigest: expectedManifest.manifestDigest,
      probeProgramBytes: dockerDiagnosticProbeProgramIdentity.byteLength,
      probeProgramSha256: dockerDiagnosticProbeProgramIdentity.sha256,
      requestedPlatform: platform,
      toolchainId: "eden-node24-check-v1",
    },
  };
  const decodedAction = decodeDockerDiagnosticProbeAction(action);
  if (!decodedAction.ok) {
    return {
      error: error(
        "docker_probe_action_invalid",
        "The exact probe action failed its closed contract.",
      ),
      ok: false,
    };
  }
  const actionDigest = dockerDiagnosticProbeActionDigest(decodedAction.value);
  const policy = evaluateDockerDiagnosticProbePolicy(decodedAction.value, input.observedAt);
  if (
    policy.decision !== "ask" ||
    policy.ruleId !== "r2.docker-diagnostic-probe.exact" ||
    policy.ruleSetRevision !== "r2-docker-diagnostic-probe-v1"
  ) {
    return {
      error: error(
        "docker_probe_policy_invalid",
        "The probe policy did not produce exact approval.",
      ),
      ok: false,
    };
  }
  const event: DockerDiagnosticProbeApprovalRequiredV1 = {
    action: decodedAction.value,
    actionDigest,
    approval: {
      approvalId: input.identity.approvalId,
      choices: ["approve", "deny"],
      expectedRevision: input.identity.revision,
    },
    eventId: input.identity.eventId,
    limitations: [
      "The probe does not inspect or execute repository code.",
      "Approval is single-use for this exact action digest.",
    ],
    nextActions: ["Approve or deny this exact diagnostic probe."],
    policy,
    probeId: input.identity.probeId,
    protocolVersion: 1,
    revision: input.identity.revision,
    type: "docker.probe.approval.required",
  };
  const decodedEvent = decodeDockerDiagnosticProbeEvent(event);
  return decodedEvent.ok
    ? { event: decodedEvent.value as DockerDiagnosticProbeApprovalRequiredV1, ok: true }
    : {
        error: error("docker_probe_event_invalid", "The probe preview failed its closed contract."),
        ok: false,
      };
}
