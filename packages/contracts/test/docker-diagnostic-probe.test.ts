import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import {
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeCleanup,
  decodeDockerDiagnosticProbeCommand,
  decodeDockerDiagnosticProbeEvent,
  decodeDockerDiagnosticProbeProductView,
  decodeDockerDiagnosticProbeReceipt,
  decodeDockerDiagnosticProbeResult,
  decodeProductCommand,
  decodeProductEvent,
  decodeProductView,
} from "../src/index.ts";
import {
  dockerDiagnosticProbeActionFixture as action,
  dockerDiagnosticProbeApprovalCommandFixture as approvalCommand,
  dockerDiagnosticProbeApprovalRequiredFixture as approvalRequired,
  dockerDiagnosticProbeCleanupFixture as cleanup,
  dockerDiagnosticProbeProductViewFixture as productView,
  dockerDiagnosticProbeReceiptFixture as receipt,
  dockerDiagnosticProbeRecoveryResolvedFixture as recoveryResolved,
  dockerDiagnosticProbeResultFixture as result,
  dockerDiagnosticProbeTerminalEventFixture as terminalEvent,
} from "./docker-diagnostic-probe-fixture.ts";

describe("standalone Docker diagnostic probe action", () => {
  it("binds the immutable image certificate path into the closed environment", () => {
    deepStrictEqual(decodeDockerDiagnosticProbeAction(action), {
      ok: true,
      value: action,
    });
    const { SSL_CERT_FILE: _certificatePath, ...environmentWithoutCertificatePath } =
      action.profile.environment;
    strictEqual(
      decodeDockerDiagnosticProbeAction({
        ...action,
        profile: { ...action.profile, environment: environmentWithoutCertificatePath },
      }).ok,
      false,
    );
    strictEqual(
      decodeDockerDiagnosticProbeAction({
        ...action,
        profile: {
          ...action.profile,
          environment: {
            ...action.profile.environment,
            SSL_CERT_FILE: "/tmp/other.pem",
          },
        },
      }).ok,
      false,
    );
  });

  it("accepts only the exact closed action authority", () => {
    deepStrictEqual(decodeDockerDiagnosticProbeAction(action), { ok: true, value: action });

    for (const changed of [
      { ...action, runId: "run-synthetic" },
      { ...action, proposalRevision: 2 },
      { ...action, scope: { ...action.scope, repository: "workspace" } },
      { ...action, authority: { ...action.authority, network: "bridge" } },
      { ...action, budgets: { ...action.budgets, memoryBytes: 67_108_865 } },
      {
        ...action,
        operation: { ...action.operation, checks: [...action.operation.checks].reverse() },
      },
    ]) {
      strictEqual(decodeDockerDiagnosticProbeAction(changed).ok, false);
    }
  });

  it("keeps command, event, receipt, cleanup, result, and view standalone and closed", () => {
    deepStrictEqual(decodeDockerDiagnosticProbeCommand(approvalCommand), {
      ok: true,
      value: approvalCommand,
    });
    deepStrictEqual(decodeDockerDiagnosticProbeEvent(approvalRequired), {
      ok: true,
      value: approvalRequired,
    });
    deepStrictEqual(decodeDockerDiagnosticProbeEvent(terminalEvent), {
      ok: true,
      value: terminalEvent,
    });
    deepStrictEqual(decodeDockerDiagnosticProbeEvent(recoveryResolved), {
      ok: true,
      value: recoveryResolved,
    });
    deepStrictEqual(decodeDockerDiagnosticProbeReceipt(receipt), { ok: true, value: receipt });
    deepStrictEqual(decodeDockerDiagnosticProbeCleanup(cleanup), { ok: true, value: cleanup });
    deepStrictEqual(decodeDockerDiagnosticProbeResult(result), { ok: true, value: result });
    deepStrictEqual(decodeDockerDiagnosticProbeProductView(productView), {
      ok: true,
      value: productView,
    });

    strictEqual(decodeProductCommand(approvalCommand).ok, false);
    strictEqual(decodeProductEvent(approvalRequired).ok, false);
    strictEqual(decodeProductEvent(recoveryResolved).ok, false);
    strictEqual(decodeProductView(productView).ok, false);
    strictEqual(
      decodeDockerDiagnosticProbeResult({ ...result, repositoryOutput: "hidden" }).ok,
      false,
    );
    strictEqual(
      decodeDockerDiagnosticProbeResult({
        ...result,
        cleanup: { ...cleanup, effectId: "effect-other" },
      }).ok,
      false,
    );
    strictEqual(decodeDockerDiagnosticProbeEvent({ ...recoveryResolved, receipt }).ok, false);
  });
});
