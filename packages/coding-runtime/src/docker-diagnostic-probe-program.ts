import { createHash } from "node:crypto";

import {
  type DockerDiagnosticProbeLabels,
  type DockerDiagnosticProbeObservationsV1,
  decodeDockerDiagnosticProbeObservations,
} from "@eden/contracts";

export const dockerDiagnosticProbeProgramSource = String.raw`const fs=require("node:fs");
const read=(path)=>{try{return fs.readFileSync(path,"utf8").trim()}catch{return null}};
const fields=(text)=>Object.fromEntries((text??"").split("\n").map((line)=>{const at=line.indexOf(":");return at<1?["",null]:[line.slice(0,at),line.slice(at+1).trim()]}).filter(([key])=>key));
const integer=(value)=>value!==null&&/^\d+$/.test(value)?Number(value):null;
const status=fields(read("/proc/self/status"));
const uid=typeof process.getuid==="function"?process.getuid():null;
const gid=typeof process.getgid==="function"?process.getgid():null;
const uidMap=read("/proc/self/uid_map");
const mapping=uidMap===null?"unavailable":(()=>{const first=uidMap.split("\n")[0]?.trim().split(/\s+/).map(Number);return first?.length===3&&first.every(Number.isSafeInteger)&&first[0]===0&&first[1]!==0?"remapped":"identity"})();
const cap=/^[a-fA-F0-9]{1,16}$/.test(status.CapEff??"")?(status.CapEff??"").toLowerCase().padStart(16,"0"):null;
const noNewPrivs=status.NoNewPrivs==="1"?true:status.NoNewPrivs==="0"?false:null;
const seccomp=status.Seccomp==="2"?"filter":status.Seccomp==="1"?"strict":status.Seccomp==="0"?"disabled":"unavailable";
const mounts=(read("/proc/self/mountinfo")??"").split("\n").map((line)=>{const halves=line.split(" - ");const left=halves[0]?.split(" ")??[];const right=halves[1]?.split(" ")??[];return{filesystem:right[0]??null,mount:left[4]??null,options:(left[5]??"").split(",")}}).filter((row)=>row.mount);
const root=mounts.find((row)=>row.mount==="/");
const temporary=mounts.find((row)=>row.mount==="/tmp");
const memory=integer(read("/sys/fs/cgroup/memory.max"));
const swap=integer(read("/sys/fs/cgroup/memory.swap.max"));
const pids=integer(read("/sys/fs/cgroup/pids.max"));
const cpu=(read("/sys/fs/cgroup/cpu.max")??"").split(/\s+/);
const quota=integer(cpu[0]??null);
const period=integer(cpu[1]??null);
const limits=read("/proc/self/limits");
const nofile=limits?.split("\n").find((line)=>line.startsWith("Max open files"));
const descriptors=nofile===undefined?null:integer(nofile.trim().split(/\s+/)[3]??null);
const observations=[
{check:"process_user",gid,status:uid===65532&&gid===65532?"passed":uid===null||gid===null?"unavailable":"failed",uid},
{check:"user_namespace",mapping,status:mapping==="remapped"?"passed":mapping==="unavailable"?"unavailable":"failed"},
{check:"capabilities",effectiveMask:cap,status:cap==="0000000000000000"?"passed":cap===null?"unavailable":"failed"},
{check:"no_new_privileges",enabled:noNewPrivs,status:noNewPrivs===true?"passed":noNewPrivs===null?"unavailable":"failed"},
{check:"seccomp",mode:seccomp,status:seccomp==="filter"?"passed":seccomp==="unavailable"?"unavailable":"failed"},
{access:root===undefined?"unavailable":root.options.includes("ro")?"read_only":"read_write",check:"root_filesystem",status:root===undefined?"unavailable":root.options.includes("ro")?"passed":"failed"},
{check:"temporary_filesystem",filesystem:temporary?.filesystem??null,nodev:temporary?.options.includes("nodev")??null,noexec:temporary?.options.includes("noexec")??null,nosuid:temporary?.options.includes("nosuid")??null,sizeBytes:1048576,status:temporary?.filesystem==="tmpfs"&&temporary.options.includes("rw")&&temporary.options.includes("nodev")&&temporary.options.includes("noexec")&&temporary.options.includes("nosuid")?"passed":temporary===undefined?"unavailable":"failed",writable:temporary?.options.includes("rw")??null},
{check:"resource_limits",cpuPeriodMicros:period,cpuQuotaMicros:quota,fileDescriptors:descriptors,memoryBytes:memory,memorySwapBytes:memory===67108864&&swap===0?67108864:null,pids,status:memory===67108864&&swap===0&&quota===50000&&period===100000&&pids===16&&descriptors===64?"passed":[memory,swap,quota,period,pids,descriptors].some((value)=>value===null)?"unavailable":"failed"}
];
process.stdout.write(JSON.stringify({protocolVersion:1,observations}));`;

const programBytes = new TextEncoder().encode(dockerDiagnosticProbeProgramSource);

export const dockerDiagnosticProbeProgramIdentity = {
  byteLength: programBytes.byteLength,
  programId: "eden-docker-diagnostic-probe-v1",
  sha256: `sha256:${createHash("sha256").update(programBytes).digest("hex")}`,
} as const;

export type DockerDiagnosticProbeProgramDecodeResult =
  | {
      readonly observations: DockerDiagnosticProbeObservationsV1;
      readonly ok: true;
    }
  | {
      readonly code: "output_empty" | "output_invalid" | "output_overflow" | "output_utf8_invalid";
      readonly ok: false;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

export function decodeDockerDiagnosticProbeProgramOutput(
  bytes: Uint8Array,
): DockerDiagnosticProbeProgramDecodeResult {
  if (bytes.byteLength === 0) return { code: "output_empty", ok: false };
  if (bytes.byteLength > 4_096) return { code: "output_overflow", ok: false };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { code: "output_utf8_invalid", ok: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { code: "output_invalid", ok: false };
  }
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["observations", "protocolVersion"]) ||
    value.protocolVersion !== 1 ||
    !Array.isArray(value.observations) ||
    value.observations.length !== 8
  ) {
    return { code: "output_invalid", ok: false };
  }
  const observations = [
    ...value.observations,
    {
      byteLength: bytes.byteLength,
      check: "result_protocol",
      protocolVersion: 1,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      status: "passed",
    },
  ];
  const decoded = decodeDockerDiagnosticProbeObservations(observations);
  return decoded.ok
    ? { observations: decoded.value, ok: true }
    : { code: "output_invalid", ok: false };
}

export type DockerDiagnosticProbeContainerInspection = {
  readonly exitCode: number;
  readonly id: string;
  readonly labels: DockerDiagnosticProbeLabels;
  readonly name: string;
  readonly oomKilled: boolean;
  readonly running: boolean;
  readonly state: "created" | "exited" | "running";
};

export type DockerDiagnosticProbeContainerInspectionDecodeResult =
  | { readonly ok: true; readonly value: DockerDiagnosticProbeContainerInspection }
  | { readonly code: "inspection_invalid" | "inspection_overflow"; readonly ok: false };

function labelsMatch(value: unknown, expected: DockerDiagnosticProbeLabels): boolean {
  const entries = [
    ["actionId", "eden.action-id"],
    ["configDigest", "eden.config-digest"],
    ["effectId", "eden.effect-id"],
    ["imageIndexDigest", "eden.image-index-digest"],
    ["platformManifestDigest", "eden.platform-manifest-digest"],
    ["probeId", "eden.probe-id"],
    ["profileRevision", "eden.profile-revision"],
    ["schema", "eden.schema"],
  ] as const;
  return (
    isObject(value) &&
    hasExactKeys(
      value,
      entries.map(([, dockerKey]) => dockerKey),
    ) &&
    entries.every(([key, dockerKey]) => value[dockerKey] === expected[key])
  );
}

const dockerDiagnosticProbeEnvironment = [
  "HOME=/tmp",
  "LANG=C.UTF-8",
  "PATH=/usr/local/bin:/usr/bin:/bin",
  "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
] as const;

function environmentMatches(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === dockerDiagnosticProbeEnvironment.length &&
    value.every((entry) => typeof entry === "string") &&
    new Set(value).size === value.length &&
    dockerDiagnosticProbeEnvironment.every((entry) => value.includes(entry))
  );
}

export function decodeDockerDiagnosticProbeContainerInspection(
  bytes: Uint8Array,
  expectedLabels: DockerDiagnosticProbeLabels,
): DockerDiagnosticProbeContainerInspectionDecodeResult {
  if (bytes.byteLength === 0 || bytes.byteLength > 65_536) {
    return {
      code: bytes.byteLength > 65_536 ? "inspection_overflow" : "inspection_invalid",
      ok: false,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { code: "inspection_invalid", ok: false };
  }
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["Config", "HostConfig", "Id", "Name", "State"]) ||
    !isObject(value.Config) ||
    !hasExactKeys(value.Config, ["Entrypoint", "Env", "Labels", "User", "WorkingDir"]) ||
    !isObject(value.HostConfig) ||
    !hasExactKeys(value.HostConfig, [
      "AutoRemove",
      "CapDrop",
      "CpuPeriod",
      "CpuQuota",
      "IpcMode",
      "Memory",
      "MemorySwap",
      "NetworkMode",
      "PidMode",
      "PidsLimit",
      "Privileged",
      "ReadonlyRootfs",
      "RestartPolicy",
      "SecurityOpt",
      "Tmpfs",
      "UTSMode",
      "Ulimits",
      "UsernsMode",
    ]) ||
    !isObject(value.State) ||
    !hasExactKeys(value.State, ["ExitCode", "OOMKilled", "Running", "Status"])
  ) {
    return { code: "inspection_invalid", ok: false };
  }
  const config = value.Config;
  const host = value.HostConfig;
  const state = value.State;
  const restart = host.RestartPolicy;
  const tmpfs = host.Tmpfs;
  const ulimits = host.Ulimits;
  const stateName = state.Status;
  const stateReady =
    (stateName === "created" || stateName === "running" || stateName === "exited") &&
    typeof state.Running === "boolean" &&
    state.Running === (stateName === "running") &&
    Number.isInteger(state.ExitCode) &&
    (state.ExitCode as number) >= 0 &&
    (state.ExitCode as number) <= 255 &&
    typeof state.OOMKilled === "boolean";
  const shapeReady =
    typeof value.Id === "string" &&
    /^[a-f0-9]{64}$/u.test(value.Id) &&
    typeof value.Name === "string" &&
    /^\/eden-probe-[a-f0-9]{24}$/u.test(value.Name) &&
    config.User === "65532:65532" &&
    config.WorkingDir === "/tmp" &&
    JSON.stringify(config.Entrypoint) === JSON.stringify(["/nodejs/bin/node"]) &&
    environmentMatches(config.Env) &&
    labelsMatch(config.Labels, expectedLabels) &&
    host.AutoRemove === false &&
    JSON.stringify(host.CapDrop) === JSON.stringify(["ALL"]) &&
    host.CpuPeriod === 100_000 &&
    host.CpuQuota === 50_000 &&
    host.IpcMode === "private" &&
    host.Memory === 67_108_864 &&
    host.MemorySwap === 67_108_864 &&
    host.NetworkMode === "none" &&
    host.PidMode === "" &&
    host.PidsLimit === 16 &&
    host.Privileged === false &&
    host.ReadonlyRootfs === true &&
    isObject(restart) &&
    hasExactKeys(restart, ["Name"]) &&
    restart.Name === "no" &&
    JSON.stringify(host.SecurityOpt) === JSON.stringify(["no-new-privileges"]) &&
    isObject(tmpfs) &&
    hasExactKeys(tmpfs, ["/tmp"]) &&
    tmpfs["/tmp"] === "rw,noexec,nosuid,nodev,size=1048576" &&
    host.UTSMode === "" &&
    Array.isArray(ulimits) &&
    ulimits.length === 1 &&
    isObject(ulimits[0]) &&
    hasExactKeys(ulimits[0], ["Hard", "Name", "Soft"]) &&
    ulimits[0].Hard === 64 &&
    ulimits[0].Name === "nofile" &&
    ulimits[0].Soft === 64 &&
    host.UsernsMode === "";
  if (!stateReady || !shapeReady) return { code: "inspection_invalid", ok: false };
  return {
    ok: true,
    value: {
      exitCode: state.ExitCode as number,
      id: value.Id as string,
      labels: expectedLabels,
      name: (value.Name as string).slice(1),
      oomKilled: state.OOMKilled as boolean,
      running: state.Running as boolean,
      state: stateName,
    },
  };
}
