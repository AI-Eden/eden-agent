import { deepStrictEqual, strictEqual } from "node:assert";
import { chmod, lstat, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { decodeDockerDoctorReport } from "@eden/contracts";

import {
  DockerCliDoctorPort,
  type DockerDoctorObservation,
  type DockerDoctorPort,
  DockerDoctorService,
  type NativeProcessObservation,
  type NativeProcessRequest,
} from "../src/index.ts";

const readyObservation = {
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
} satisfies DockerDoctorObservation;

describe("read-only Docker doctor", () => {
  it("projects one closed ready report without creating missing Eden state", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-ready-"));
    const stateDirectory = join(root, "missing-state");
    const port: DockerDoctorPort = {
      inspect: async () => readyObservation,
    };
    const report = await new DockerDoctorService({
      clock: () => new Date("2026-07-30T12:00:00.000Z"),
      port,
      stateDirectory,
    }).inspect();

    strictEqual(decodeDockerDoctorReport(report).ok, true);
    deepStrictEqual(
      report.rows.map((row) => [row.id, row.status]),
      [
        ["docker.client", "ready"],
        ["docker.daemon", "ready"],
        ["docker.context", "ready"],
        ["docker.api", "ready"],
        ["docker.backend", "ready"],
        ["docker.platform", "ready"],
        ["docker.image", "ready"],
        ["docker.security", "ready"],
        ["docker.resources", "ready"],
        ["docker.staging", "ready"],
        ["eden.state", "ready"],
        ["docker.orphans", "ready"],
      ],
    );
    strictEqual(report.mode, "read_only");
    strictEqual(report.mutation, "none");
    strictEqual(
      await lstat(stateDirectory).then(
        () => "present",
        () => "missing",
      ),
      "missing",
    );
  });

  it("uses only bounded read commands and decodes fixed Docker JSON fixtures", async () => {
    const requests: NativeProcessRequest[] = [];
    const observations: NativeProcessObservation[] = [
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from(
          JSON.stringify({
            Client: { ApiVersion: "1.51", Arch: "amd64", Os: "linux", Version: "28.3.3" },
            Server: {
              ApiVersion: "1.51",
              Arch: "amd64",
              MinAPIVersion: "1.24",
              Os: "linux",
              Platform: { Name: "Docker Engine - Community" },
              Version: "29.6.2",
            },
          }),
        ),
      },
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from("default\n"),
      },
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from(
          JSON.stringify({
            Endpoints: { docker: { Host: "unix:///var/run/docker.sock" } },
            Name: "default",
          }),
        ),
      },
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from(
          JSON.stringify({
            CgroupVersion: "2",
            CpuCfsPeriod: true,
            CpuCfsQuota: true,
            MemoryLimit: true,
            OperatingSystem: "Docker Engine - Community",
            PidsLimit: true,
            SecurityOptions: ["name=seccomp,profile=builtin", "name=userns", "name=cgroupns"],
            SwapLimit: true,
          }),
        ),
      },
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from(
          JSON.stringify({
            Architecture: "amd64",
            Config: {
              Entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
              User: "65532:65532",
              WorkingDir: "/workspace",
            },
            Id: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
            Os: "linux",
            RepoDigests: [
              "ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
            ],
          }),
        ),
      },
      {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      },
    ];
    const port = new DockerCliDoctorPort({
      cwd: "/workspace",
      nativeProcess: {
        run: async (request) => {
          requests.push(request);
          const observation = observations.shift();
          if (observation === undefined) throw new Error("Unexpected Docker CLI request.");
          return observation;
        },
      },
    });

    deepStrictEqual(await port.inspect(), readyObservation);
    deepStrictEqual(
      requests.map((request) => request.arguments),
      [
        ["version", "--format", "{{json .}}"],
        ["context", "show"],
        ["context", "inspect", "--format", "{{json .}}", "default"],
        ["info", "--format", "{{json .}}"],
        [
          "image",
          "inspect",
          "--format",
          "{{json .}}",
          "ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
        ],
        [
          "container",
          "ls",
          "--all",
          "--filter",
          "label=eden.schema=eden.repository-check.v1",
          "--format",
          "{{json .}}",
        ],
      ],
    );
    strictEqual(
      requests.every(
        (request) =>
          request.maxStdoutBytes === 65_536 &&
          request.maxStderrBytes === 4_096 &&
          request.timeoutMs === 5_000,
      ),
      true,
    );
    strictEqual(
      requests.some((request) =>
        ["build", "create", "import", "login", "pull", "remove", "run", "start"].includes(
          request.arguments[0] ?? "",
        ),
      ),
      false,
    );
  });

  it("keeps an available client distinct from an unreachable daemon", async () => {
    const requests: NativeProcessRequest[] = [];
    const port = new DockerCliDoctorPort({
      cwd: "/workspace",
      nativeProcess: {
        run: async (request) => {
          requests.push(request);
          return {
            exitCode: 1,
            status: "exited",
            stderr: Buffer.from("daemon unavailable"),
            stdout: Buffer.from(
              JSON.stringify({
                Client: {
                  ApiVersion: "1.51",
                  Arch: "amd64",
                  Os: "linux",
                  Version: "28.3.3",
                },
              }),
            ),
          };
        },
      },
    });

    deepStrictEqual(await port.inspect(), {
      client: readyObservation.client,
      context: { status: "unreachable" },
      daemon: { status: "unreachable" },
      image: { status: "unreachable" },
      orphans: { status: "unreachable" },
    });
    strictEqual(requests.length, 1);
  });

  it("selects one named Docker context on every bounded read command", async () => {
    const requests: NativeProcessRequest[] = [];
    const port = new DockerCliDoctorPort({
      cwd: "/workspace",
      dockerContext: "eden-fresh-userns",
      nativeProcess: {
        run: async (request) => {
          requests.push(request);
          return {
            exitCode: 1,
            status: "exited",
            stderr: new Uint8Array(),
            stdout: new Uint8Array(),
          };
        },
      },
    });

    await port.inspect();

    deepStrictEqual(requests[0]?.arguments, [
      "--context",
      "eden-fresh-userns",
      "version",
      "--format",
      "{{json .}}",
    ]);
  });

  it("blocks native Windows mode, an old API, mismatched image, unsafe features, and labels", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-blocked-"));
    const observation: DockerDoctorObservation = {
      ...readyObservation,
      context: {
        status: "ready",
        value: { endpoint: "ssh://unexpected-host", name: "remote" },
      },
      daemon: {
        status: "ready",
        value: {
          ...readyObservation.daemon.value,
          apiVersion: "1.42",
          cpuCfsQuota: false,
          osType: "windows",
          securityOptions: [],
        },
      },
      image: {
        status: "ready",
        value: {
          ...readyObservation.image.value,
          indexDigest: `sha256:${"0".repeat(64)}`,
        },
      },
      orphans: {
        status: "ready",
        value: [
          {
            id: "a".repeat(64),
            labels: { schema: "eden.repository-check.v1" },
            name: "eden-check-mismatched",
            state: "exited",
          },
        ],
      },
    };
    const report = await new DockerDoctorService({
      clock: () => new Date("2026-07-30T12:00:00.000Z"),
      port: { inspect: async () => observation },
      stateDirectory: join(root, "missing-state"),
    }).inspect();

    deepStrictEqual(
      Object.fromEntries(report.rows.map((doctorRow) => [doctorRow.id, doctorRow.status])),
      {
        "docker.api": "blocked",
        "docker.backend": "blocked",
        "docker.client": "ready",
        "docker.context": "blocked",
        "docker.daemon": "ready",
        "docker.image": "blocked",
        "docker.orphans": "blocked",
        "docker.platform": "blocked",
        "docker.resources": "blocked",
        "docker.security": "blocked",
        "docker.staging": "ready",
        "eden.state": "ready",
      },
    );
  });

  it("fails closed without truncating an over-budget orphan identity set", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-orphans-"));
    const observation: DockerDoctorObservation = {
      ...readyObservation,
      orphans: {
        status: "ready",
        value: Array.from({ length: 20 }, (_, index) => ({
          id: index.toString(16).padStart(64, "0"),
          labels: {
            actionId: `action-${index}`,
            effectId: `effect-${index}`,
            schema: "eden.repository-check.v1",
          },
          name: `eden-check-${index.toString().padStart(3, "0")}-${"x".repeat(70)}`,
          state: "exited",
        })),
      },
    };
    const report = await new DockerDoctorService({
      port: { inspect: async () => observation },
      stateDirectory: join(root, "missing-state"),
    }).inspect();
    const orphanRow = report.rows.find((doctorRow) => doctorRow.id === "docker.orphans");

    strictEqual(decodeDockerDoctorReport(report).ok, true);
    strictEqual(orphanRow?.status, "blocked");
    deepStrictEqual(orphanRow?.details, [
      { name: "count", value: "20" },
      { name: "identities", value: "over-budget" },
    ]);
  });

  it("blocks an API negotiation gap even when the daemon exceeds the frozen floor", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-api-gap-"));
    const observation: DockerDoctorObservation = {
      ...readyObservation,
      daemon: {
        status: "ready",
        value: {
          ...readyObservation.daemon.value,
          minApiVersion: "1.52",
        },
      },
    };
    const report = await new DockerDoctorService({
      port: { inspect: async () => observation },
      stateDirectory: join(root, "missing-state"),
    }).inspect();

    strictEqual(report.rows.find((doctorRow) => doctorRow.id === "docker.api")?.status, "blocked");
  });

  it("blocks a platform manifest mismatch independently of the image index", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-platform-manifest-"));
    const observation: DockerDoctorObservation = {
      ...readyObservation,
      image: {
        status: "ready",
        value: {
          ...readyObservation.image.value,
          manifestDigest: `sha256:${"0".repeat(64)}`,
        },
      },
    };
    const report = await new DockerDoctorService({
      port: { inspect: async () => observation },
      stateDirectory: join(root, "missing-state"),
    }).inspect();

    strictEqual(
      report.rows.find((doctorRow) => doctorRow.id === "docker.image")?.status,
      "blocked",
    );
  });

  it("fails closed for unsafe existing state permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-state-"));
    const stateDirectory = join(root, "state");
    await mkdir(stateDirectory);
    await chmod(stateDirectory, 0o755);

    const report = await new DockerDoctorService({
      port: { inspect: async () => readyObservation },
      stateDirectory,
    }).inspect();

    strictEqual(
      report.rows.find((doctorRow) => doctorRow.id === "docker.staging")?.status,
      "blocked",
    );
    strictEqual(report.rows.find((doctorRow) => doctorRow.id === "eden.state")?.status, "blocked");
  });

  it("maps a timed-out Docker client read to a closed report without follow-up commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-timeout-"));
    const requests: NativeProcessRequest[] = [];
    const port = new DockerCliDoctorPort({
      cwd: "/workspace",
      nativeProcess: {
        run: async (request) => {
          requests.push(request);
          return {
            exitCode: null,
            status: "timed-out",
            stderr: new Uint8Array(),
            stdout: new Uint8Array(),
          };
        },
      },
    });

    const report = await new DockerDoctorService({
      port,
      stateDirectory: join(root, "missing-state"),
    }).inspect();

    strictEqual(decodeDockerDoctorReport(report).ok, true);
    strictEqual(
      report.rows.find((doctorRow) => doctorRow.id === "docker.client")?.status,
      "blocked",
    );
    deepStrictEqual(
      requests.map((request) => request.arguments),
      [["version", "--format", "{{json .}}"]],
    );
  });

  it("maps malformed Docker JSON to a closed report without follow-up commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-docker-doctor-malformed-"));
    const requests: NativeProcessRequest[] = [];
    const port = new DockerCliDoctorPort({
      cwd: "/workspace",
      nativeProcess: {
        run: async (request) => {
          requests.push(request);
          return {
            exitCode: 0,
            status: "exited",
            stderr: new Uint8Array(),
            stdout: Buffer.from("{not-json"),
          };
        },
      },
    });

    const report = await new DockerDoctorService({
      port,
      stateDirectory: join(root, "missing-state"),
    }).inspect();

    strictEqual(decodeDockerDoctorReport(report).ok, true);
    strictEqual(
      report.rows.find((doctorRow) => doctorRow.id === "docker.client")?.status,
      "blocked",
    );
    deepStrictEqual(
      requests.map((request) => request.arguments),
      [["version", "--format", "{{json .}}"]],
    );
  });
});
