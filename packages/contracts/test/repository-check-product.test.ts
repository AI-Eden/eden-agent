import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { decodeProductEvent, decodeProductView, executingProductView } from "../src/index.ts";

const sha256 = (character: string) => `sha256:${character.repeat(64)}`;

const repositoryCheck = {
  actionId: "action-repository-check-1",
  checkName: "test",
  effectId: "effect-repository-check-1",
  input: {
    catalogSha256: sha256("1"),
    imageIndexDigest: sha256("2"),
    manifestDigest: sha256("3"),
    platformManifestDigest: sha256("4"),
    profileRevision: "r2-docker-profile-v1",
  },
  isolation: {
    network: "none",
    rootFilesystem: "read_only",
    workspaceMount: "read_only",
  },
  lifecycle: [
    {
      observedAt: "2026-07-30T03:00:00.000Z",
      state: "awaiting_approval",
    },
  ],
  limitations: ["Repository output is local-only and untrusted."],
  nextActions: ["Approve or deny this exact named check."],
  process: {
    arguments: ["--test"],
    cwd: ".",
    executable: "/usr/local/bin/node",
  },
  projectionVersion: 1,
  receipt: null,
  result: null,
  runId: executingProductView.runId,
  state: "awaiting_approval",
};

describe("repository-check product projection", () => {
  it("accepts equivalent closed ProductView and ProductEvent fields", () => {
    const view = { ...executingProductView, repositoryCheck };
    deepStrictEqual(decodeProductView(view), { ok: true, value: view });

    const event = {
      cursor: 9,
      eventId: "event-repository-check-1",
      protocolVersion: 1,
      repositoryCheck,
      revision: executingProductView.revision,
      runId: executingProductView.runId,
      type: "repository.check.updated",
    };
    deepStrictEqual(decodeProductEvent(event), { ok: true, value: event });
  });

  it("rejects hidden Docker commands, run mismatch, and generic succeeded projection", () => {
    strictEqual(
      decodeProductView({
        ...executingProductView,
        repositoryCheck: { ...repositoryCheck, dockerCommand: "docker run ..." },
      }).ok,
      false,
    );
    strictEqual(
      decodeProductView({
        ...executingProductView,
        repositoryCheck: { ...repositoryCheck, runId: "run-other" },
      }).ok,
      false,
    );
    strictEqual(
      decodeProductView({
        ...executingProductView,
        repositoryCheck,
        terminalOutcome: { evidenceRef: "evidence-check", state: "succeeded" },
      }).ok,
      false,
    );
  });
});
