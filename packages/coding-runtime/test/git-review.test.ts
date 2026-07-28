import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { decodeChangeReview } from "@eden/contracts";

import { AnchorEditService, createEdenPatch, GitReviewService } from "../src/index.ts";
import type { NativeProcessPort } from "../src/native-process.ts";

const observedAt = "2026-07-28T09:00:00.000Z";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "eden-git-review-"));
  const stateDirectory = `${root}-state`;
  mkdirSync(stateDirectory, { mode: 0o700 });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "before\nold value\n");
  writeFileSync(join(root, "other.txt"), "other\n");
  execFileSync("git", ["add", "tracked.txt", "other.txt"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "user dirty\nold value\n");
  writeFileSync(join(root, "other.txt"), "other dirty\n");
  return { root, stateDirectory };
}

describe("complete Git review", () => {
  it("keeps Eden delta separate and attributes dirty tracked plus untracked state", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const sentinel = join(root, "external-diff-ran");
      const external = join(stateDirectory, "external-diff.sh");
      writeFileSync(external, `#!/bin/sh\ntouch '${sentinel}'\nexit 99\n`);
      chmodSync(external, 0o700);
      execFileSync("git", ["config", "diff.external", external], { cwd: root });
      const anchor = new AnchorEditService({ stateDirectory, workspaceRoot: root });
      const envelope = await anchor.prepare({
        actionId: "action-review-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        proposalRevision: 1,
        replacements: [{ expectedOccurrences: 1, newText: "new value", oldText: "old value" }],
        runId: "run-review-1",
        workspaceId: "workspace-review-1",
      });
      const base = readFileSync(join(root, "tracked.txt"), "utf8");
      const edenPatch = createEdenPatch(envelope, base);
      strictEqual(edenPatch.state, "complete");
      if (edenPatch.state !== "complete") throw new Error("Expected a complete Eden patch.");
      strictEqual(
        edenPatch.content,
        [
          "diff --eden a/tracked.txt b/tracked.txt\n",
          "--- a/tracked.txt\n",
          "+++ b/tracked.txt\n",
          "@@ -1,2 +1,2 @@\n",
          " user dirty\n",
          "-old value\n",
          "+new value\n",
        ].join(""),
      );
      const reviewService = new GitReviewService({
        now: () => observedAt,
        workspaceRoot: root,
      });
      const baseline = await reviewService.capture();
      await anchor.execute(envelope);
      writeFileSync(join(root, "untracked-说明.txt"), "not read by review\n");
      const review = await reviewService.review(baseline, envelope, edenPatch);

      strictEqual(decodeChangeReview(review).ok, true);
      deepStrictEqual(review.changedFiles, [
        { attribution: "pre_existing", path: "other.txt", status: "modified" },
        { attribution: "both", path: "tracked.txt", status: "modified" },
      ]);
      deepStrictEqual(review.untrackedPaths, ["untracked-说明.txt"]);
      strictEqual(review.currentTrackedPatch.state, "complete");
      strictEqual(review.currentCheck.status, "passed");
      strictEqual(existsSync(sentinel), false);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("separates pre-existing and newly introduced diff-check diagnostics", async () => {
    const { root, stateDirectory } = fixture();
    try {
      writeFileSync(join(root, "other.txt"), "pre-existing trailing  \n");
      const anchor = new AnchorEditService({ stateDirectory, workspaceRoot: root });
      const envelope = await anchor.prepare({
        actionId: "action-review-2",
        canonicalRootHash: `sha256:${"b".repeat(64)}`,
        path: "tracked.txt",
        proposalRevision: 1,
        replacements: [{ expectedOccurrences: 1, newText: "new value  ", oldText: "old value" }],
        runId: "run-review-2",
        workspaceId: "workspace-review-2",
      });
      const edenPatch = createEdenPatch(envelope, readFileSync(join(root, "tracked.txt"), "utf8"));
      const reviewService = new GitReviewService({
        now: () => observedAt,
        workspaceRoot: root,
      });
      const baseline = await reviewService.capture();
      await anchor.execute(envelope);
      const review = await reviewService.review(baseline, envelope, edenPatch);

      strictEqual(baseline.check.status, "failed");
      strictEqual(baseline.check.diagnostics.length, 1);
      strictEqual(review.currentCheck.status, "failed");
      strictEqual(review.currentCheck.diagnostics.length, 2);
      strictEqual(review.newlyObservedDiagnostics.length, 1);
      strictEqual(
        review.currentCheck.diagnostics.find(
          (diagnostic) => diagnostic.diagnosticId === review.newlyObservedDiagnostics[0],
        )?.path,
        "tracked.txt",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("blocks rather than truncating an Eden patch beyond 24 KiB", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const longContext = "x".repeat(12_300);
      const large = `${longContext}\ncontext\nold value\n${longContext}\n`;
      writeFileSync(join(root, "large.txt"), large);
      execFileSync("git", ["add", "large.txt"], { cwd: root });
      execFileSync("git", ["commit", "--quiet", "-m", "large"], { cwd: root });
      const anchor = new AnchorEditService({ stateDirectory, workspaceRoot: root });
      const envelope = await anchor.prepare({
        actionId: "action-review-large",
        canonicalRootHash: `sha256:${"c".repeat(64)}`,
        path: "large.txt",
        proposalRevision: 1,
        replacements: [{ expectedOccurrences: 1, newText: "new value", oldText: "old value" }],
        runId: "run-review-large",
        workspaceId: "workspace-review-large",
      });
      const patch = createEdenPatch(envelope, large);
      strictEqual(patch.state, "blocked");
      if (patch.state !== "blocked") throw new Error("Expected a blocked patch.");
      strictEqual(patch.error.code, "review_budget_exceeded");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("accepts an exact 24 KiB Eden patch and blocks one additional byte", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const anchor = new AnchorEditService({ stateDirectory, workspaceRoot: root });
      const create = async (rightLength: number, suffix: string) => {
        const base = `${"a".repeat(12_000)}\ncontext\nold value\n${"b".repeat(rightLength)}\n`;
        writeFileSync(join(root, "tracked.txt"), base);
        const envelope = await anchor.prepare({
          actionId: `action-review-boundary-${suffix}`,
          canonicalRootHash: `sha256:${"d".repeat(64)}`,
          path: "tracked.txt",
          proposalRevision: 1,
          replacements: [{ expectedOccurrences: 1, newText: "new value", oldText: "old value" }],
          runId: `run-review-boundary-${suffix}`,
          workspaceId: "workspace-review-boundary",
        });
        return createEdenPatch(envelope, base);
      };
      const initial = await create(12_000, "initial");
      strictEqual(initial.state, "complete");
      if (initial.state !== "complete") throw new Error("Expected a complete initial patch.");
      const exactRightLength = 12_000 + (24_576 - initial.byteLength);
      const exact = await create(exactRightLength, "exact");
      strictEqual(exact.state, "complete");
      if (exact.state !== "complete") throw new Error("Expected an exact complete patch.");
      strictEqual(exact.byteLength, 24_576);

      const overflow = await create(exactRightLength + 1, "overflow");
      strictEqual(overflow.state, "blocked");
      if (overflow.state !== "blocked") throw new Error("Expected one-byte overflow.");
      strictEqual(overflow.error.code, "review_budget_exceeded");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("accepts an exact 24 KiB tracked Git patch and blocks one additional byte", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const reviewService = new GitReviewService({
        now: () => observedAt,
        workspaceRoot: root,
      });
      writeFileSync(join(root, "tracked.txt"), `${"x".repeat(23_000)}\n`);
      const initial = (await reviewService.captureSnapshot()).trackedPatch;
      strictEqual(initial.state, "complete");
      if (initial.state !== "complete") throw new Error("Expected a complete initial patch.");
      const exactLength = 23_000 + (24_576 - initial.byteLength);
      writeFileSync(join(root, "tracked.txt"), `${"x".repeat(exactLength)}\n`);
      const exact = (await reviewService.captureSnapshot()).trackedPatch;
      strictEqual(exact.state, "complete");
      if (exact.state !== "complete") throw new Error("Expected an exact complete patch.");
      strictEqual(exact.byteLength, 24_576);

      writeFileSync(join(root, "tracked.txt"), `${"x".repeat(exactLength + 1)}\n`);
      const overflow = (await reviewService.captureSnapshot()).trackedPatch;
      strictEqual(overflow.state, "blocked");
      if (overflow.state !== "blocked") throw new Error("Expected one-byte overflow.");
      strictEqual(overflow.error.code, "review_budget_exceeded");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("reports conflict markers as current diagnostics with stable identities", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const reviewService = new GitReviewService({
        now: () => observedAt,
        workspaceRoot: root,
      });
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      const baseline = await reviewService.captureCheck(head);
      writeFileSync(
        join(root, "tracked.txt"),
        "<<<<<<< ours\nuser dirty\n=======\nother\n>>>>>>> theirs\n",
      );
      const current = await reviewService.captureCheck(head);

      strictEqual(baseline.status, "passed");
      strictEqual(current.status, "failed");
      strictEqual(
        current.diagnostics.some((diagnostic) =>
          diagnostic.message.includes("leftover conflict marker"),
        ),
        true,
      );
      strictEqual(
        current.diagnostics.every((diagnostic) => diagnostic.diagnosticId.startsWith("sha256:")),
        true,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("fails closed on malformed UTF-8 and unknown diff-check output", async () => {
    const { root, stateDirectory } = fixture();
    try {
      for (const stdout of [
        Uint8Array.from([0xff]),
        Buffer.from("../../escape.ts:1: trailing whitespace.\n"),
      ]) {
        const nativeProcess: NativeProcessPort = {
          async run(request) {
            const isHead = request.arguments.includes("rev-parse");
            return {
              exitCode: 0,
              status: "exited",
              stderr: new Uint8Array(),
              stdout: request.arguments.includes("--version")
                ? Buffer.from("git version 2.43.0\n")
                : isHead
                  ? Buffer.from(`${"a".repeat(40)}\n`)
                  : stdout,
            };
          },
        };
        const reviewService = new GitReviewService({
          nativeProcess,
          now: () => observedAt,
          workspaceRoot: root,
        });
        await rejects(
          reviewService.captureCheck("a".repeat(40)),
          (error: unknown) =>
            error instanceof Error &&
            ["git_diff_check_invalid_utf8", "git_diff_check_output_invalid"].includes(
              "productError" in error &&
                typeof error.productError === "object" &&
                error.productError !== null &&
                "code" in error.productError
                ? String(error.productError.code)
                : "",
            ),
        );
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("refuses to label a diff-check with a HEAD that changed during capture", async () => {
    const { root, stateDirectory } = fixture();
    try {
      let headCalls = 0;
      const nativeProcess: NativeProcessPort = {
        async run(request) {
          const stdout = request.arguments.includes("--version")
            ? Buffer.from("git version 2.43.0\n")
            : request.arguments.includes("rev-parse")
              ? Buffer.from(`${headCalls++ === 0 ? "a".repeat(40) : "b".repeat(40)}\n`)
              : new Uint8Array();
          return {
            exitCode: 0,
            status: "exited",
            stderr: new Uint8Array(),
            stdout,
          };
        },
      };
      const reviewService = new GitReviewService({
        nativeProcess,
        now: () => observedAt,
        workspaceRoot: root,
      });

      await rejects(
        reviewService.captureCheck("a".repeat(40)),
        (error: unknown) =>
          error instanceof Error &&
          "productError" in error &&
          typeof error.productError === "object" &&
          error.productError !== null &&
          "code" in error.productError &&
          error.productError.code === "review_head_changed",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });
});
