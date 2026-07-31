import { lstat } from "node:fs/promises";
import { dirname } from "node:path";

import type { DockerDoctorReportV1 } from "@eden/contracts";

import type {
  NativeProcessObservation,
  NativeProcessPort,
  NativeProcessRequest,
} from "./native-process.ts";
import {
  repositoryCheckToolchainConfigDigests,
  repositoryCheckToolchainImageReference,
  repositoryCheckToolchainManifest,
} from "./repository-check-toolchain.ts";

type DockerDoctorRead<T> =
  | { readonly status: "ready"; readonly value: T }
  | {
      readonly status: "malformed" | "missing" | "timed_out" | "unreachable";
    };

export type DockerDoctorObservation = {
  readonly client: DockerDoctorRead<{
    readonly apiVersion: string;
    readonly architecture: string;
    readonly operatingSystem: string;
    readonly version: string;
  }>;
  readonly context: DockerDoctorRead<{
    readonly endpoint: string;
    readonly name: string;
  }>;
  readonly daemon: DockerDoctorRead<{
    readonly apiVersion: string;
    readonly architecture: string;
    readonly cgroupVersion: string;
    readonly cpuCfsPeriod: boolean;
    readonly cpuCfsQuota: boolean;
    readonly memoryLimit: boolean;
    readonly minApiVersion: string;
    readonly operatingSystem: string;
    readonly osType: string;
    readonly pidsLimit: boolean;
    readonly platformName: string;
    readonly securityOptions: readonly string[];
    readonly serverVersion: string;
    readonly swapLimit: boolean;
  }>;
  readonly image: DockerDoctorRead<{
    readonly architecture: string;
    readonly configDigest: string;
    readonly entrypoint: readonly string[];
    readonly indexDigest: string;
    readonly manifestDigest: string;
    readonly manifestEvidence: "frozen_config_mapping" | "local_descriptor";
    readonly operatingSystem: string;
    readonly user: string;
    readonly workingDirectory: string;
  }>;
  readonly orphans: DockerDoctorRead<
    readonly {
      readonly id: string;
      readonly labels: Readonly<Record<string, string>>;
      readonly name: string;
      readonly state: string;
    }[]
  >;
};

export interface DockerDoctorPort {
  inspect(signal?: AbortSignal): Promise<DockerDoctorObservation>;
}

export type DockerCliDoctorPortOptions = {
  readonly cwd: string;
  readonly dockerContext?: string;
  readonly dockerExecutable?: string;
  readonly nativeProcess: NativeProcessPort;
};

export type DockerDoctorServiceOptions = {
  readonly clock?: () => Date;
  readonly port: DockerDoctorPort;
  readonly stateDirectory: string;
};

type DoctorRow = DockerDoctorReportV1["rows"][number];

function row(
  id: DoctorRow["id"],
  status: DoctorRow["status"],
  summary: string,
  details: readonly { readonly name: string; readonly value: string }[] = [],
): DoctorRow {
  return { details: [...details], id, status, summary };
}

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

function statusSummary(status: Exclude<DockerDoctorRead<never>["status"], "ready">): string {
  if (status === "missing") return "is unavailable";
  if (status === "timed_out") return "timed out";
  if (status === "malformed") return "returned malformed data";
  return "is unreachable";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, name: string): string | null {
  return typeof value[name] === "string" ? value[name] : null;
}

function booleanField(value: Record<string, unknown>, name: string): boolean | null {
  return typeof value[name] === "boolean" ? value[name] : null;
}

function parseJsonObject(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes.byteLength === 0) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function readStatus(
  observation: NativeProcessObservation,
): Exclude<DockerDoctorRead<never>["status"], "ready"> | null {
  if (observation.status === "spawn-failed") return "missing";
  if (observation.status === "timed-out") return "timed_out";
  if (observation.status === "output-overflow") return "malformed";
  if (observation.status !== "exited" || observation.exitCode !== 0) return "unreachable";
  return null;
}

function unavailableObservation(
  status: Exclude<DockerDoctorRead<never>["status"], "ready">,
): DockerDoctorObservation {
  return {
    client: { status },
    context: { status },
    daemon: { status },
    image: { status },
    orphans: { status },
  };
}

function parseLabels(value: string): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const name = entry.slice(0, separator);
    const labelValue = entry.slice(separator + 1);
    if (name === "eden.schema") labels.schema = labelValue;
    if (name === "eden.action-id") labels.actionId = labelValue;
    if (name === "eden.effect-id") labels.effectId = labelValue;
  }
  return labels;
}

export class DockerCliDoctorPort implements DockerDoctorPort {
  readonly #cwd: string;
  readonly #dockerContext: string | undefined;
  readonly #dockerExecutable: string;
  readonly #nativeProcess: NativeProcessPort;

  constructor(options: DockerCliDoctorPortOptions) {
    this.#cwd = options.cwd;
    this.#dockerContext = options.dockerContext;
    this.#dockerExecutable = options.dockerExecutable ?? "docker";
    this.#nativeProcess = options.nativeProcess;
  }

  async #run(
    arguments_: readonly string[],
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    const request: NativeProcessRequest = {
      arguments:
        this.#dockerContext === undefined
          ? arguments_
          : ["--context", this.#dockerContext, ...arguments_],
      cwd: this.#cwd,
      environment: {
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
      },
      executable: this.#dockerExecutable,
      maxStderrBytes: 4_096,
      maxStdoutBytes: 65_536,
      timeoutMs: 5_000,
    };
    return this.#nativeProcess.run(request, signal);
  }

  async inspect(signal?: AbortSignal): Promise<DockerDoctorObservation> {
    const versionObservation = await this.#run(["version", "--format", "{{json .}}"], signal);
    const versionStatus = readStatus(versionObservation);
    if (versionObservation.status !== "exited") {
      return unavailableObservation(versionStatus ?? "unreachable");
    }
    const version = parseJsonObject(versionObservation.stdout);
    const client = version !== null && isObject(version.Client) ? version.Client : null;
    const server = version !== null && isObject(version.Server) ? version.Server : null;
    if (client === null) return unavailableObservation(versionStatus ?? "malformed");

    const clientValue = {
      apiVersion: stringField(client, "ApiVersion"),
      architecture: stringField(client, "Arch"),
      operatingSystem: stringField(client, "Os"),
      version: stringField(client, "Version"),
    };
    if (Object.values(clientValue).some((value) => value === null)) {
      return unavailableObservation("malformed");
    }
    if (versionStatus !== null || server === null) {
      return {
        ...unavailableObservation(versionStatus ?? "unreachable"),
        client: { status: "ready", value: clientValue as NonNullableFields<typeof clientValue> },
      };
    }

    const contextShow = await this.#run(["context", "show"], signal);
    const contextShowStatus = readStatus(contextShow);
    let context: DockerDoctorObservation["context"];
    if (contextShowStatus !== null || contextShow.status !== "exited") {
      context = { status: contextShowStatus ?? "unreachable" };
    } else {
      const contextName = new TextDecoder().decode(contextShow.stdout).trim();
      if (contextName.length === 0 || contextName.length > 128) {
        context = { status: "malformed" };
      } else {
        const contextInspect = await this.#run(
          ["context", "inspect", "--format", "{{json .}}", contextName],
          signal,
        );
        const contextInspectStatus = readStatus(contextInspect);
        const parsed =
          contextInspectStatus === null && contextInspect.status === "exited"
            ? parseJsonObject(contextInspect.stdout)
            : null;
        const endpoints = parsed !== null && isObject(parsed.Endpoints) ? parsed.Endpoints : null;
        const docker = endpoints !== null && isObject(endpoints.docker) ? endpoints.docker : null;
        const endpoint = docker === null ? null : stringField(docker, "Host");
        context =
          endpoint === null
            ? { status: contextInspectStatus ?? "malformed" }
            : { status: "ready", value: { endpoint, name: contextName } };
      }
    }

    const infoObservation = await this.#run(["info", "--format", "{{json .}}"], signal);
    const infoStatus = readStatus(infoObservation);
    const info =
      infoStatus === null && infoObservation.status === "exited"
        ? parseJsonObject(infoObservation.stdout)
        : null;
    const serverValue = {
      apiVersion: stringField(server, "ApiVersion"),
      architecture: stringField(server, "Arch"),
      minApiVersion: stringField(server, "MinAPIVersion"),
      osType: stringField(server, "Os"),
      platformName:
        isObject(server.Platform) && stringField(server.Platform, "Name") !== null
          ? stringField(server.Platform, "Name")
          : "",
      serverVersion: stringField(server, "Version"),
    };
    const securityOptions =
      info !== null &&
      Array.isArray(info.SecurityOptions) &&
      info.SecurityOptions.every((value) => typeof value === "string")
        ? info.SecurityOptions
        : null;
    const daemon =
      info === null ||
      Object.values(serverValue).some((value) => value === null) ||
      securityOptions === null
        ? ({ status: infoStatus ?? "malformed" } as const)
        : ({
            status: "ready",
            value: {
              apiVersion: serverValue.apiVersion,
              architecture: serverValue.architecture,
              cgroupVersion: stringField(info, "CgroupVersion") ?? "unknown",
              cpuCfsPeriod: booleanField(info, "CpuCfsPeriod") ?? false,
              cpuCfsQuota: booleanField(info, "CpuCfsQuota") ?? false,
              memoryLimit: booleanField(info, "MemoryLimit") ?? false,
              minApiVersion: serverValue.minApiVersion,
              operatingSystem: stringField(info, "OperatingSystem") ?? "unknown",
              osType: serverValue.osType,
              pidsLimit: booleanField(info, "PidsLimit") ?? false,
              platformName: serverValue.platformName,
              securityOptions,
              serverVersion: serverValue.serverVersion,
              swapLimit: booleanField(info, "SwapLimit") ?? false,
            },
          } as const);

    const imageObservation = await this.#run(
      ["image", "inspect", "--format", "{{json .}}", repositoryCheckToolchainImageReference],
      signal,
    );
    const imageReadStatus = readStatus(imageObservation);
    const imageObject =
      imageReadStatus === null && imageObservation.status === "exited"
        ? parseJsonObject(imageObservation.stdout)
        : null;
    const config = imageObject !== null && isObject(imageObject.Config) ? imageObject.Config : null;
    const descriptorPresent = imageObject !== null && Object.hasOwn(imageObject, "Descriptor");
    const descriptor =
      imageObject !== null && isObject(imageObject.Descriptor) ? imageObject.Descriptor : null;
    const repoDigests =
      imageObject !== null &&
      Array.isArray(imageObject.RepoDigests) &&
      imageObject.RepoDigests.every((value) => typeof value === "string")
        ? imageObject.RepoDigests
        : [];
    const entrypoint =
      config !== null &&
      Array.isArray(config.Entrypoint) &&
      config.Entrypoint.every((value) => typeof value === "string")
        ? config.Entrypoint
        : null;
    const indexDigest = repoDigests
      .map((value) => value.slice(value.lastIndexOf("@") + 1))
      .find((value) => value === repositoryCheckToolchainManifest.imageIndexDigest);
    const architecture = imageObject === null ? null : stringField(imageObject, "Architecture");
    const operatingSystem = imageObject === null ? null : stringField(imageObject, "Os");
    const configDigest = imageObject === null ? null : stringField(imageObject, "Id");
    const platform =
      operatingSystem === "linux" && (architecture === "amd64" || architecture === "arm64")
        ? (`linux/${architecture}` as const)
        : null;
    const expectedManifest = repositoryCheckToolchainManifest.platforms.find(
      (candidate) => candidate.platform === platform,
    );
    const manifestIdentity = descriptorPresent
      ? descriptor === null || stringField(descriptor, "digest") === null
        ? null
        : {
            manifestDigest: stringField(descriptor, "digest") as string,
            manifestEvidence: "local_descriptor" as const,
          }
      : platform !== null &&
          expectedManifest !== undefined &&
          indexDigest !== undefined &&
          configDigest === repositoryCheckToolchainConfigDigests[platform]
        ? {
            manifestDigest: expectedManifest.manifestDigest,
            manifestEvidence: "frozen_config_mapping" as const,
          }
        : null;
    const image =
      imageObject === null ||
      config === null ||
      entrypoint === null ||
      indexDigest === undefined ||
      architecture === null ||
      operatingSystem === null ||
      configDigest === null ||
      manifestIdentity === null
        ? ({
            status:
              imageReadStatus === "unreachable" ? "missing" : (imageReadStatus ?? "malformed"),
          } as const)
        : ({
            status: "ready",
            value: {
              architecture,
              configDigest,
              entrypoint,
              indexDigest,
              ...manifestIdentity,
              operatingSystem,
              user: stringField(config, "User") ?? "",
              workingDirectory: stringField(config, "WorkingDir") ?? "",
            },
          } as const);

    const orphanObservation = await this.#run(
      [
        "container",
        "ls",
        "--all",
        "--filter",
        "label=eden.schema=eden.repository-check.v1",
        "--format",
        "{{json .}}",
      ],
      signal,
    );
    const orphanReadStatus = readStatus(orphanObservation);
    let orphans: DockerDoctorObservation["orphans"];
    if (orphanReadStatus !== null || orphanObservation.status !== "exited") {
      orphans = { status: orphanReadStatus ?? "unreachable" };
    } else {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(orphanObservation.stdout);
      const values = text.trim().length === 0 ? [] : text.trimEnd().split(/\r?\n/u);
      const parsed = values.map((line) => {
        try {
          const value: unknown = JSON.parse(line);
          return isObject(value) ? value : null;
        } catch {
          return null;
        }
      });
      if (parsed.some((value) => value === null)) {
        orphans = { status: "malformed" };
      } else {
        const containers = parsed.filter(
          (value): value is Record<string, unknown> => value !== null,
        );
        orphans = {
          status: "ready",
          value: containers.map((value) => ({
            id: stringField(value, "ID") ?? "",
            labels: parseLabels(stringField(value, "Labels") ?? ""),
            name: stringField(value, "Names") ?? "",
            state: stringField(value, "State") ?? "",
          })),
        };
      }
    }

    return {
      client: {
        status: "ready",
        value: clientValue as NonNullableFields<typeof clientValue>,
      },
      context,
      daemon: daemon as DockerDoctorObservation["daemon"],
      image,
      orphans,
    };
  }
}

type NonNullableFields<T> = { readonly [K in keyof T]: NonNullable<T[K]> };

async function inspectStateRows(stateDirectory: string): Promise<readonly DoctorRow[]> {
  let state: Awaited<ReturnType<typeof lstat>> | null = null;
  try {
    state = await lstat(stateDirectory);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return [
        row("docker.staging", "blocked", "The staging filesystem is unavailable."),
        row("eden.state", "blocked", "The Eden state path is unavailable."),
      ];
    }
  }

  if (state === null) {
    try {
      const parent = await lstat(dirname(stateDirectory));
      const parentReady = parent.isDirectory() && !parent.isSymbolicLink();
      return [
        row(
          "docker.staging",
          parentReady ? "ready" : "blocked",
          parentReady
            ? "The prospective staging parent is a local directory."
            : "The prospective staging parent is unsafe.",
          [{ name: "statePresent", value: "false" }],
        ),
        row("eden.state", "ready", "No Eden state exists; doctor created nothing.", [
          { name: "present", value: "false" },
        ]),
      ];
    } catch {
      return [
        row("docker.staging", "blocked", "The prospective staging parent is unavailable."),
        row("eden.state", "ready", "No Eden state exists; doctor created nothing.", [
          { name: "present", value: "false" },
        ]),
      ];
    }
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const ownerReady = uid === null || state.uid === uid;
  const permissionsReady = (state.mode & 0o077) === 0;
  const shapeReady = state.isDirectory() && !state.isSymbolicLink();
  const safe = ownerReady && permissionsReady && shapeReady;
  return [
    row(
      "docker.staging",
      safe ? "ready" : "blocked",
      safe ? "The Eden state directory can own private staging." : "Private staging is blocked.",
      [{ name: "statePresent", value: "true" }],
    ),
    row(
      "eden.state",
      safe ? "ready" : "blocked",
      safe
        ? "Eden state ownership and permissions are safe."
        : "Eden state permissions are unsafe.",
      [
        { name: "mode", value: `0${(state.mode & 0o777).toString(8)}` },
        { name: "ownerMatches", value: String(ownerReady) },
      ],
    ),
  ];
}

export class DockerDoctorService {
  readonly #clock: () => Date;
  readonly #port: DockerDoctorPort;
  readonly #stateDirectory: string;

  constructor(options: DockerDoctorServiceOptions) {
    this.#clock = options.clock ?? (() => new Date());
    this.#port = options.port;
    this.#stateDirectory = options.stateDirectory;
  }

  async inspect(signal?: AbortSignal): Promise<DockerDoctorReportV1> {
    const observation = await this.#port.inspect(signal);
    const rows: DoctorRow[] = [];

    if (observation.client.status !== "ready") {
      rows.push(
        row(
          "docker.client",
          "blocked",
          `The Docker client ${statusSummary(observation.client.status)}.`,
        ),
      );
    } else {
      rows.push(
        row("docker.client", "ready", "The Docker client is available.", [
          { name: "version", value: observation.client.value.version },
          { name: "apiVersion", value: observation.client.value.apiVersion },
        ]),
      );
    }

    if (observation.daemon.status !== "ready") {
      rows.push(
        row(
          "docker.daemon",
          "blocked",
          `The Docker daemon ${statusSummary(observation.daemon.status)}.`,
        ),
      );
    } else {
      rows.push(
        row("docker.daemon", "ready", "The Docker daemon is reachable.", [
          { name: "version", value: observation.daemon.value.serverVersion },
          { name: "operatingSystem", value: observation.daemon.value.operatingSystem },
        ]),
      );
    }

    if (observation.context.status !== "ready") {
      rows.push(
        row(
          "docker.context",
          "blocked",
          `The Docker context ${statusSummary(observation.context.status)}.`,
        ),
      );
    } else {
      const contextReady =
        observation.context.value.name.length > 0 &&
        /^(?:unix|npipe|tcp):\/\//u.test(observation.context.value.endpoint);
      rows.push(
        row(
          "docker.context",
          contextReady ? "ready" : "blocked",
          contextReady
            ? "The active Docker context is explicit."
            : "The Docker context is unsupported.",
          [
            { name: "name", value: observation.context.value.name },
            { name: "endpoint", value: observation.context.value.endpoint },
          ],
        ),
      );
    }

    const client = observation.client.status === "ready" ? observation.client.value : null;
    const daemon = observation.daemon.status === "ready" ? observation.daemon.value : null;
    const apiReady =
      client !== null &&
      daemon !== null &&
      versionAtLeast(client.apiVersion, "1.43") &&
      versionAtLeast(daemon.apiVersion, "1.43") &&
      versionAtLeast(client.apiVersion, daemon.minApiVersion) &&
      versionAtLeast(daemon.apiVersion, daemon.minApiVersion);
    rows.push(
      row(
        "docker.api",
        apiReady ? "ready" : "blocked",
        apiReady
          ? "The Docker API satisfies the frozen floor."
          : "Docker API 1.43 or newer is required.",
        [
          { name: "minimum", value: "1.43" },
          { name: "clientApiVersion", value: client?.apiVersion ?? "unavailable" },
          { name: "daemonApiVersion", value: daemon?.apiVersion ?? "unavailable" },
          { name: "daemonMinimumApiVersion", value: daemon?.minApiVersion ?? "unavailable" },
        ],
      ),
    );

    const backendReady = daemon !== null && daemon.osType === "linux";
    rows.push(
      row(
        "docker.backend",
        backendReady ? "ready" : "blocked",
        backendReady
          ? "The daemon is in Linux-container mode."
          : "A Linux-container Docker backend is required.",
        [
          { name: "osType", value: daemon?.osType ?? "unavailable" },
          { name: "platform", value: daemon?.platformName ?? "unavailable" },
        ],
      ),
    );

    const platform =
      daemon?.osType === "linux" &&
      (daemon.architecture === "amd64" || daemon.architecture === "arm64")
        ? (`linux/${daemon.architecture}` as "linux/amd64" | "linux/arm64")
        : null;
    rows.push(
      row(
        "docker.platform",
        platform === null ? "blocked" : "ready",
        platform === null
          ? "The daemon platform is unsupported."
          : "The daemon platform has a published toolchain manifest.",
        [{ name: "platform", value: platform ?? "unsupported" }],
      ),
    );

    const expectedManifest = repositoryCheckToolchainManifest.platforms.find(
      (candidate) => candidate.platform === platform,
    );
    const expectedConfigDigest =
      platform === null ? undefined : repositoryCheckToolchainConfigDigests[platform];
    const image = observation.image.status === "ready" ? observation.image.value : null;
    const imageReady =
      image !== null &&
      expectedManifest !== undefined &&
      image.indexDigest === repositoryCheckToolchainManifest.imageIndexDigest &&
      image.configDigest === expectedConfigDigest &&
      image.manifestDigest === expectedManifest.manifestDigest &&
      image.operatingSystem === "linux" &&
      image.architecture === daemon?.architecture &&
      image.user === "65532:65532" &&
      image.workingDirectory === repositoryCheckToolchainManifest.paths.workspace &&
      image.entrypoint.length === 2 &&
      image.entrypoint[0] === "/nodejs/bin/node" &&
      image.entrypoint[1] === repositoryCheckToolchainManifest.paths.wrapper;
    rows.push(
      row(
        "docker.image",
        imageReady ? "ready" : "blocked",
        imageReady
          ? "The exact local Eden toolchain image is ready with pull policy never."
          : "The exact local Eden toolchain image is absent or mismatched; prepare it manually.",
        [
          { name: "pullPolicy", value: "never" },
          { name: "indexDigest", value: image?.indexDigest ?? "unavailable" },
          { name: "manifestDigest", value: image?.manifestDigest ?? "unavailable" },
          { name: "configDigest", value: image?.configDigest ?? "unavailable" },
          { name: "manifestEvidence", value: image?.manifestEvidence ?? "unavailable" },
        ],
      ),
    );

    const securityOptions = daemon?.securityOptions ?? [];
    const seccomp = securityOptions.some((value) => value.startsWith("name=seccomp"));
    const userNamespace = securityOptions.includes("name=userns");
    const cgroupNamespace = securityOptions.includes("name=cgroupns");
    const securityReady = seccomp && userNamespace && cgroupNamespace;
    rows.push(
      row(
        "docker.security",
        securityReady ? "ready" : "blocked",
        securityReady
          ? "The backend reports the required namespace and seccomp prerequisites."
          : "The backend lacks a required user namespace, cgroup namespace, or seccomp feature.",
        [
          { name: "seccomp", value: String(seccomp) },
          { name: "userNamespace", value: String(userNamespace) },
          { name: "cgroupNamespace", value: String(cgroupNamespace) },
        ],
      ),
    );

    const resourcesReady =
      daemon?.memoryLimit === true &&
      daemon.swapLimit &&
      daemon.cpuCfsPeriod &&
      daemon.cpuCfsQuota &&
      daemon.pidsLimit;
    rows.push(
      row(
        "docker.resources",
        resourcesReady ? "ready" : "blocked",
        resourcesReady
          ? "The daemon reports every frozen resource-control prerequisite."
          : "One or more required Docker resource controls are unavailable.",
        [
          { name: "memory", value: String(daemon?.memoryLimit ?? false) },
          { name: "swap", value: String(daemon?.swapLimit ?? false) },
          { name: "cpu", value: String(Boolean(daemon?.cpuCfsPeriod && daemon.cpuCfsQuota)) },
          { name: "pids", value: String(daemon?.pidsLimit ?? false) },
          { name: "cgroupVersion", value: daemon?.cgroupVersion ?? "unavailable" },
        ],
      ),
    );

    rows.push(...(await inspectStateRows(this.#stateDirectory)));

    const orphans = observation.orphans.status === "ready" ? observation.orphans.value : null;
    const orphanLabelsReady =
      orphans?.every(
        (container) =>
          /^[a-f0-9]{12,64}$/u.test(container.id) &&
          container.labels.schema === "eden.repository-check.v1" &&
          container.labels.actionId !== undefined &&
          container.labels.effectId !== undefined,
      ) === true;
    const orphanIdentities =
      orphans === null
        ? "unavailable"
        : orphans.map((container) => `${container.name}:${container.id}`).join(",");
    const orphanIdentitiesFit = new TextEncoder().encode(orphanIdentities).byteLength <= 512;
    const orphanReady = orphanLabelsReady && orphanIdentitiesFit;
    rows.push(
      row(
        "docker.orphans",
        !orphanReady ? "blocked" : orphans.length === 0 ? "ready" : "warning",
        !orphanLabelsReady
          ? "Exactly attributed Docker object inspection failed."
          : !orphanIdentitiesFit
            ? "The complete orphan identity set exceeds the closed doctor budget."
            : orphans.length === 0
              ? "No exactly attributed repository-check containers exist."
              : "Exactly attributed repository-check containers require manual review.",
        [
          { name: "count", value: orphans === null ? "unavailable" : String(orphans.length) },
          {
            name: "identities",
            value: orphanIdentitiesFit ? orphanIdentities : "over-budget",
          },
        ],
      ),
    );

    return {
      doctorVersion: 1,
      mode: "read_only",
      mutation: "none",
      observedAt: this.#clock().toISOString(),
      rows,
    };
  }
}
