import {
  createDockerDiagnosticProbeRecoveryRequiredEvent,
  type DockerDiagnosticProbeIdentity,
  DockerDiagnosticProbeJournal,
  type DockerDiagnosticProbeRecoveryPort,
  type DockerDoctorPort,
  executeDockerDiagnosticProbe,
  prepareDockerDiagnosticProbeApproval,
  projectDockerDiagnosticProbeJournal,
  recoverDockerDiagnosticProbe,
} from "@eden/coding-runtime";
import {
  type DockerDiagnosticProbeApprovalRequiredV1,
  type DockerDiagnosticProbeRecoveryRequiredV1,
  type DockerDiagnosticProbeRecoveryResolvedV1,
  decodeDockerDiagnosticProbeEvent,
  type ProductError,
} from "@eden/contracts";

import type { CliArguments } from "./args.ts";

type DoctorProbeArguments = Extract<CliArguments, { readonly mode: "doctor-probe" }>;

export type DockerDiagnosticProbePreviewEnvironment = {
  readonly approvalRequired: DockerDiagnosticProbeApprovalRequiredV1;
  readonly confirm: () => Promise<"approve" | "deny">;
  readonly io: {
    readonly stderr: (value: string) => unknown;
    readonly stdout: (value: string) => unknown;
  };
};

export type DockerDiagnosticProbeEnvironment = {
  readonly clock?: () => string;
  readonly confirm: () => Promise<"approve" | "deny">;
  readonly effectId?: string;
  readonly executionPort?: DockerDiagnosticProbeRecoveryPort;
  readonly id?: () => string;
  readonly identity: DockerDiagnosticProbeIdentity;
  readonly io: DockerDiagnosticProbePreviewEnvironment["io"];
  readonly observedAt: string;
  readonly port: DockerDoctorPort;
  readonly recoveryEventId: string;
  readonly stateDirectory: string;
};

function contractError(): ProductError {
  return {
    code: "runtime_contract_failure",
    message: "Docker diagnostic probe preview produced an invalid closed value.",
    recoverability: "fatal",
    suggestedActions: ["Reject the preview and inspect the local installation."],
  };
}

function executionUnavailableError(): ProductError {
  return {
    code: "docker_probe_execution_unavailable",
    message: "The approved preview was not dispatched because Docker execution is unavailable.",
    recoverability: "retry",
    suggestedActions: ["Retry only after the deterministic probe gates are complete."],
  };
}

function renderPlain(event: DockerDiagnosticProbeApprovalRequiredV1): string {
  return `${[
    "docker diagnostic probe: approval required",
    `policy: ${event.policy.decision} · ${event.policy.ruleId}`,
    `action-digest: ${event.actionDigest}`,
    `action: ${JSON.stringify(event.action)}`,
    `limitations: ${event.limitations.join(" · ")}`,
    `next: ${event.nextActions.join(" · ")}`,
  ].join("\n")}\n`;
}

function renderRecoveryPlain(event: DockerDiagnosticProbeRecoveryRequiredV1): string {
  return `${[
    "docker diagnostic probe: recovery required",
    `probe: ${event.probeId}`,
    `effect: ${event.effectId}`,
    `last-state: ${event.lastLifecycleState}`,
    `action-digest: ${event.actionDigest}`,
    `limitations: ${event.limitations.join(" · ")}`,
    `next: ${event.nextAction}`,
  ].join("\n")}\n`;
}

function renderRecoveryResolvedPlain(event: DockerDiagnosticProbeRecoveryResolvedV1): string {
  return `${[
    "docker diagnostic probe: recovery resolved",
    `probe: ${event.probeId}`,
    `effect: ${event.effectId}`,
    `previous-state: ${event.lastLifecycleState}`,
    `outcome: ${event.outcome}`,
    `reason: ${event.reason}`,
    `next: ${event.nextAction}`,
  ].join("\n")}\n`;
}

function renderTerminalPlain(result: {
  readonly cleanup: { readonly status: string };
  readonly outcome: string;
}): string {
  return `${[
    `docker diagnostic probe: ${result.outcome}`,
    `cleanup: ${result.cleanup.status}`,
    "next: Review the closed diagnostic observations.",
  ].join("\n")}\n`;
}

export async function runDockerDiagnosticProbePreview(
  arguments_: DoctorProbeArguments,
  environment: DockerDiagnosticProbePreviewEnvironment,
): Promise<0 | 1 | 2> {
  const decoded = decodeDockerDiagnosticProbeEvent(environment.approvalRequired);
  if (!decoded.ok || decoded.value.type !== "docker.probe.approval.required") {
    environment.io.stderr(`${JSON.stringify(contractError())}\n`);
    return 1;
  }
  const event = decoded.value;
  if (arguments_.format === "json") {
    environment.io.stdout(`${JSON.stringify(event)}\n`);
    return 2;
  }

  environment.io.stdout(renderPlain(event));
  const decision = await environment.confirm();
  if (decision === "deny") {
    environment.io.stdout("decision: denied · mutation: none\n");
    return 2;
  }

  environment.io.stdout("decision: approved · mutation: none\n");
  environment.io.stderr(`${JSON.stringify(executionUnavailableError())}\n`);
  return 1;
}

export async function runDockerDiagnosticProbe(
  arguments_: DoctorProbeArguments,
  environment: DockerDiagnosticProbeEnvironment,
): Promise<0 | 1 | 2> {
  try {
    const journal = new DockerDiagnosticProbeJournal({
      stateDirectory: environment.stateDirectory,
    });
    const projection = projectDockerDiagnosticProbeJournal(await journal.load());
    if (projection.status === "unresolved") {
      const recovery = createDockerDiagnosticProbeRecoveryRequiredEvent(
        projection,
        environment.recoveryEventId,
      );
      if (!recovery.ok) {
        environment.io.stderr(`${JSON.stringify(contractError())}\n`);
        return 1;
      }
      if (arguments_.format === "json") {
        environment.io.stdout(`${JSON.stringify(recovery.event)}\n`);
        return 2;
      }
      environment.io.stdout(renderRecoveryPlain(recovery.event));
      if (
        environment.clock === undefined ||
        environment.executionPort === undefined ||
        environment.id === undefined
      ) {
        return 2;
      }
      const recovered = await recoverDockerDiagnosticProbe({
        clock: environment.clock,
        executionPort: environment.executionPort,
        id: environment.id,
        stateDirectory: environment.stateDirectory,
      });
      if (!recovered.ok) {
        environment.io.stderr(`${JSON.stringify(recovered.error)}\n`);
        return 1;
      }
      if (recovered.outcome === "terminal") {
        environment.io.stdout(renderTerminalPlain(recovered.result));
        return recovered.result.outcome === "passed" ? 0 : 1;
      }
      environment.io.stdout(renderRecoveryResolvedPlain(recovered.event));
    }

    const preparation = prepareDockerDiagnosticProbeApproval({
      identity: environment.identity,
      observation: await environment.port.inspect(),
      observedAt: environment.observedAt,
    });
    if (!preparation.ok) {
      environment.io.stderr(`${JSON.stringify(preparation.error)}\n`);
      return 1;
    }
    if (arguments_.format === "json") {
      return runDockerDiagnosticProbePreview(arguments_, {
        approvalRequired: preparation.event,
        confirm: environment.confirm,
        io: environment.io,
      });
    }
    environment.io.stdout(renderPlain(preparation.event));
    const decision = await environment.confirm();
    if (decision === "deny") {
      environment.io.stdout("decision: denied · mutation: none\n");
      return 2;
    }
    if (
      environment.clock === undefined ||
      environment.effectId === undefined ||
      environment.executionPort === undefined ||
      environment.id === undefined
    ) {
      environment.io.stdout("decision: approved · mutation: none\n");
      environment.io.stderr(`${JSON.stringify(executionUnavailableError())}\n`);
      return 1;
    }
    const executed = await executeDockerDiagnosticProbe(
      {
        approvalCommand: {
          actionDigest: preparation.event.actionDigest,
          approvalId: preparation.event.approval.approvalId,
          commandId: environment.id(),
          decision: "approve",
          expectedRevision: preparation.event.revision,
          probeId: preparation.event.probeId,
          protocolVersion: 1,
          type: "docker.probe.approval.resolve",
        },
        approvalRequired: preparation.event,
        effectId: environment.effectId,
      },
      {
        clock: environment.clock,
        doctorPort: environment.port,
        executionPort: environment.executionPort,
        id: environment.id,
        stateDirectory: environment.stateDirectory,
      },
    );
    if (!executed.ok) {
      environment.io.stderr(`${JSON.stringify(executed.error)}\n`);
      return 1;
    }
    environment.io.stdout(renderTerminalPlain(executed.result));
    return executed.result.outcome === "passed" ? 0 : 1;
  } catch {
    environment.io.stderr(`${JSON.stringify(contractError())}\n`);
    return 1;
  }
}
