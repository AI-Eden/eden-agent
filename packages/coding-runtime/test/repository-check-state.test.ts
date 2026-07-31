import { deepStrictEqual, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  repositoryCheckActionFixture,
  repositoryCheckInternalResultFixture,
} from "../../contracts/test/repository-check-fixture.ts";
import { createRepositoryCheckExecutionPlan } from "../src/repository-check-runner.ts";
import { prepareRepositoryCheckExecutionState } from "../src/repository-check-state.ts";

const effectId = "effect-repository-check-1";

test("repository-check state keeps exact control/result paths and a durable receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-repository-check-state-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { mode: 0o555 });
  const planned = createRepositoryCheckExecutionPlan(repositoryCheckActionFixture, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const cleanupCalls: string[] = [];
  const state = await prepareRepositoryCheckExecutionState({
    cleanupStaging: async () => cleanupCalls.push("cleanup"),
    effectId,
    plan: planned.plan,
    stateDirectory: root,
    validateStaging: async () => true,
    workspace,
  });

  strictEqual(await state.validate(planned.plan), true);
  strictEqual((await lstat(state.paths.control)).mode & 0o777, 0o444);
  strictEqual((await lstat(state.paths.result)).mode & 0o777, 0o666);
  deepStrictEqual(
    JSON.parse((await readFile(state.paths.control, "utf8")).trim()),
    planned.plan.request,
  );
  await writeFile(
    state.paths.result,
    `${JSON.stringify(repositoryCheckInternalResultFixture)}\n`,
    "utf8",
  );
  const result = await state.readInternalResult();
  strictEqual(result?.value.effectId, effectId);

  const receipt = {
    internalResult: repositoryCheckInternalResultFixture,
    receipt: {
      actionId: planned.plan.action.actionId,
      configDigest: planned.plan.configDigest,
      container: { id: "a".repeat(64), name: planned.plan.containerName },
      effectId,
      labels: planned.plan.labels,
      lifecycleState: "exited" as const,
      receiptId: "receipt-repository-check-1",
      receiptVersion: 1 as const,
      recordedAt: "2026-08-01T03:00:02.000Z",
      resultDigest: `sha256:${createHash("sha256")
        .update(`${JSON.stringify(repositoryCheckInternalResultFixture)}\n`)
        .digest("hex")}`,
      resultOutcome: "failed" as const,
      stagingIdentity: planned.plan.action.staging.identity,
    },
  };
  await state.recordReceipt(receipt);
  deepStrictEqual(await state.readReceipt(), receipt);
  strictEqual(await state.cleanupStaging(), true);
  deepStrictEqual(cleanupCalls, ["cleanup"]);
});

test("repository-check state rejects a linked durable receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-repository-check-state-link-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { mode: 0o555 });
  const planned = createRepositoryCheckExecutionPlan(repositoryCheckActionFixture, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const state = await prepareRepositoryCheckExecutionState({
    cleanupStaging: async () => undefined,
    effectId,
    plan: planned.plan,
    stateDirectory: root,
    validateStaging: async () => true,
    workspace,
  });
  const outside = join(root, "outside.json");
  await writeFile(outside, "{}\n", { mode: 0o600 });
  await symlink(outside, state.receiptPath);
  strictEqual(await state.readReceipt(), "unknown");
  await chmod(outside, 0o600);
});
