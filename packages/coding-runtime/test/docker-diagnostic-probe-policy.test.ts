import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import type { DockerDiagnosticProbeActionV1 } from "@eden/contracts";
import { dockerDiagnosticProbeActionFixture } from "../../contracts/test/docker-diagnostic-probe-fixture.ts";
import {
  canonicalDockerDiagnosticProbeActionBytes,
  consumeDockerDiagnosticProbeApproval,
  createDockerDiagnosticProbeApproval,
  dockerDiagnosticProbeActionDigest,
  evaluateDockerDiagnosticProbePolicy,
} from "../src/index.ts";

const action = dockerDiagnosticProbeActionFixture as DockerDiagnosticProbeActionV1;

test("standalone probe canonical bytes and policy bind one exact always-ask action", () => {
  const bytes = canonicalDockerDiagnosticProbeActionBytes(action);

  strictEqual(bytes.byteLength, 2_477);
  strictEqual(
    dockerDiagnosticProbeActionDigest(action),
    "c72190e0aebe5512362cf891954913bca226aa1d734a71bd0635998a99f92b03",
  );
  strictEqual(
    dockerDiagnosticProbeActionDigest({ ...action, actionId: "action-docker-probe-2" }),
    dockerDiagnosticProbeActionDigest(action),
  );
  deepStrictEqual(evaluateDockerDiagnosticProbePolicy(action, "2026-07-31T00:00:00.000Z"), {
    actionDigest: "c72190e0aebe5512362cf891954913bca226aa1d734a71bd0635998a99f92b03",
    decision: "ask",
    evaluatedAt: "2026-07-31T00:00:00.000Z",
    reason: "The exact Docker diagnostic probe requires one interactive approval.",
    ruleId: "r2.docker-diagnostic-probe.exact",
    ruleSetRevision: "r2-docker-diagnostic-probe-v1",
  });
});

test("standalone probe approval is exact, revision-bound, and single-use", () => {
  const approval = createDockerDiagnosticProbeApproval({
    action,
    approvalId: "approval-probe-1",
    expectedRevision: 1,
  });
  const consumed = consumeDockerDiagnosticProbeApproval(approval, action, 1);

  strictEqual(consumed.ok, true);
  if (!consumed.ok) return;
  strictEqual(consumed.approval.state, "consumed");
  deepStrictEqual(consumeDockerDiagnosticProbeApproval(consumed.approval, action, 1), {
    code: "approval_already_consumed",
    ok: false,
  });
  deepStrictEqual(
    consumeDockerDiagnosticProbeApproval(
      approval,
      { ...action, actionId: "action-docker-probe-2" },
      1,
    ),
    { code: "approval_identity_mismatch", ok: false },
  );
  deepStrictEqual(consumeDockerDiagnosticProbeApproval(approval, action, 2), {
    code: "approval_revision_stale",
    ok: false,
  });
  deepStrictEqual(
    consumeDockerDiagnosticProbeApproval(
      approval,
      {
        ...action,
        toolchain: {
          ...action.toolchain,
          probeProgramSha256: `sha256:${"4".repeat(64)}`,
        },
      },
      1,
    ),
    { code: "approval_digest_mismatch", ok: false },
  );
});
