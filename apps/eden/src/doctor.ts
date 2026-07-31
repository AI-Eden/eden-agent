import {
  DockerCliDoctorPort,
  type DockerDoctorPort,
  DockerDoctorService,
  NativeProcessRunner,
} from "@eden/coding-runtime";
import { decodeDockerDoctorReport, type ProductError } from "@eden/contracts";

import type { CliArguments } from "./args.ts";
import { fitTerminalLine } from "./tui-text.ts";

type DoctorArguments = Extract<CliArguments, { readonly mode: "doctor" }>;

export type DockerDoctorEnvironment = {
  readonly cwd: string;
  readonly dockerExecutable?: string;
  readonly io: {
    readonly stderr: (value: string) => unknown;
    readonly stdout: (value: string) => unknown;
  };
  readonly port?: DockerDoctorPort;
  readonly stateDirectory: string;
};

function contractError(): ProductError {
  return {
    code: "runtime_contract_failure",
    message: "Docker doctor produced an invalid closed report.",
    recoverability: "fatal",
    suggestedActions: ["Inspect the local installation and retry read-only doctor."],
  };
}

function runtimeError(): ProductError {
  return {
    code: "docker_doctor_unavailable",
    message: "Docker doctor failed without exposing local state details.",
    recoverability: "retry",
    suggestedActions: ["Retry read-only doctor and inspect the local Docker installation."],
  };
}

function renderPlain(report: ReturnType<typeof decodeDockerDoctorReport> & { ok: true }): string {
  const lines = [`doctor: ${report.value.mode} · mutation: ${report.value.mutation}`];
  for (const row of report.value.rows) {
    lines.push(`${row.id} · ${row.status}: ${fitTerminalLine(row.summary, 512)}`);
    if (row.details.length > 0) {
      lines.push(
        `  ${fitTerminalLine(
          row.details.map((detail) => `${detail.name}=${detail.value}`).join(" · "),
          1_024,
        )}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function runDockerDoctor(
  arguments_: DoctorArguments,
  environment: DockerDoctorEnvironment,
): Promise<0 | 1> {
  try {
    const port =
      environment.port ??
      new DockerCliDoctorPort({
        cwd: environment.cwd,
        ...(environment.dockerExecutable === undefined
          ? {}
          : { dockerExecutable: environment.dockerExecutable }),
        nativeProcess: new NativeProcessRunner(),
      });
    const decoded = decodeDockerDoctorReport(
      await new DockerDoctorService({
        port,
        stateDirectory: environment.stateDirectory,
      }).inspect(),
    );
    if (!decoded.ok) {
      environment.io.stderr(`${JSON.stringify(contractError())}\n`);
      return 1;
    }
    environment.io.stdout(
      arguments_.format === "json"
        ? `${JSON.stringify(decoded.value)}\n`
        : renderPlain(decoded as typeof decoded & { ok: true }),
    );
    return decoded.value.rows.some((row) => row.status === "blocked") ? 1 : 0;
  } catch {
    environment.io.stderr(`${JSON.stringify(runtimeError())}\n`);
    return 1;
  }
}
