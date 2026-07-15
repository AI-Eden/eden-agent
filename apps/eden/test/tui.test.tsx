import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InProcessAgentClient } from "@eden/coding-runtime";
import type { ProductView, WorkspaceReview } from "@eden/contracts";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { EdenTuiApp } from "../src/tui.tsx";

function ids(...values: readonly string[]) {
  let cursor = 0;
  return {
    next() {
      const value = values[cursor];
      cursor += 1;
      if (value === undefined) throw new Error("The deterministic ID source is exhausted.");
      return value;
    },
  };
}

async function directories() {
  const base = await mkdtemp(join(tmpdir(), "eden-tui-"));
  const stateDirectory = join(base, "state");
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  return { stateDirectory, workspaceDirectory };
}

function queue<T>() {
  const values: T[] = [];
  const waiters: Array<(value: T) => void> = [];
  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter === undefined) values.push(value);
      else waiter(value);
    },
    take() {
      const value = values.shift();
      return value === undefined
        ? new Promise<T>((resolve) => waiters.push(resolve))
        : Promise.resolve(value);
    },
  };
}

async function setup(width = 100, height = 30, paths?: Awaited<ReturnType<typeof directories>>) {
  const fixturePaths = paths ?? (await directories());
  const client = await InProcessAgentClient.open({
    cwd: fixturePaths.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2", "event-3", "event-4", "event-5"),
    stateDirectory: fixturePaths.stateDirectory,
  });
  const initialWorkspaceReview = await client.getWorkspaceReview();
  const reviews = queue<WorkspaceReview>();
  const views = queue<ProductView>();
  const renderer = await testRender(
    <EdenTuiApp
      client={client}
      initialWorkspaceReview={initialWorkspaceReview}
      onViewChange={(view) => views.push(view)}
      onWorkspaceReviewChange={(review) => reviews.push(review)}
    />,
    { height, width },
  );
  await act(async () => {
    await reviews.take();
    renderer.flush();
  });
  return { client, paths: fixturePaths, renderer, reviews, views };
}

async function trustWorkspace(fixture: Awaited<ReturnType<typeof setup>>) {
  const changed = fixture.reviews.take();
  await act(async () => {
    fixture.renderer.mockInput.pressKey("t");
    await changed;
  });
  await act(async () => fixture.renderer.flush());
  const frame = fixture.renderer.captureCharFrame();
  expect(frame).toContain("no credential required");
  expect(frame).toContain("trust: trusted");
  expect(frame).toContain("Task");
}

async function enterTask(fixture: Awaited<ReturnType<typeof setup>>) {
  await act(async () => fixture.renderer.mockInput.pressEnter());
  await act(async () => fixture.renderer.flush());
  expect(fixture.renderer.captureCharFrame()).toContain("Enter submits");
  await act(async () => fixture.renderer.mockInput.typeText("Trust the repository"));
  expect((await fixture.client.getWorkspaceReview()).workspace.trust).toBe("trusted");
  const changed = fixture.views.take();
  await act(async () => {
    fixture.renderer.mockInput.pressEnter();
    await changed;
  });
  await act(async () => fixture.renderer.flush());
  expect(fixture.renderer.captureCharFrame()).toContain("approval: pending");
}

test("fresh onboarding shows exact restricted authority and creates no run", async () => {
  // Given: a real client over a fresh exact workspace.
  const fixture = await setup();
  try {
    const initial = fixture.renderer.captureCharFrame();

    // When: the operator explicitly remains restricted.
    const changed = fixture.reviews.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("r");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    // Then: trust and capability truth stay visible without durable run state.
    const frame = fixture.renderer.captureCharFrame();
    expect(initial).toContain(fixture.paths.workspaceDirectory);
    expect(frame).toContain("trust: restricted");
    expect(frame).toContain("repository: read disabled · write denied");
    expect(frame).toContain("network denied · sandbox not-configured");
    expect(frame).toContain("Trust does not approve actions");
    expect(await readdir(fixture.paths.stateDirectory)).toHaveLength(0);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("the real client drives trust, task entry, separate approval, and verifier success", async () => {
  // Given: fresh onboarding in a medium terminal.
  const fixture = await setup();
  try {
    await trustWorkspace(fixture);
    await enterTask(fixture);
    const approvalFrame = fixture.renderer.captureCharFrame();

    // When: the displayed fake action is separately approved.
    const changed = fixture.views.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("a");
      await changed;
    });
    await act(async () => fixture.renderer.flush());
    const terminalFrame = fixture.renderer.captureCharFrame();

    // Then: exact action authority and verifier evidence come from product truth.
    expect(approvalFrame).toContain("trust: trusted");
    expect(approvalFrame).toContain("Run the deterministic fake task");
    expect(approvalFrame).toContain(`cwd: ${fixture.paths.workspaceDirectory}`);
    expect(approvalFrame).toContain("scope: R1 demo state directory only");
    expect(terminalFrame).toContain("evidence: run-1:fake-evidence");
    expect(terminalFrame).toContain("check: passed");
    expect(terminalFrame).toContain("phase.progress");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("persisted trust appears on relaunch and can be revoked before a run", async () => {
  // Given: trust persisted by an earlier client for the same exact workspace.
  const paths = await directories();
  const seed = await InProcessAgentClient.open({
    cwd: paths.workspaceDirectory,
    stateDirectory: paths.stateDirectory,
  });
  const review = await seed.getWorkspaceReview();
  await seed.resolveWorkspaceTrust({
    commandId: "command-trust",
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
  await seed.close();
  const fixture = await setup(100, 30, paths);
  try {
    expect(fixture.renderer.captureCharFrame()).toContain("trust: trusted");
    expect(fixture.renderer.captureCharFrame()).toContain("Task");

    // When: the operator revokes trust before task start.
    const changed = fixture.reviews.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("r");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    // Then: the composer disappears and the current review is restricted.
    const frame = fixture.renderer.captureCharFrame();
    expect(frame).toContain("trust: restricted");
    expect(frame).not.toContain("Describe the fake task");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("corrupt trust state stays restricted with actionable recovery", async () => {
  // Given: persisted trust bytes that no longer decode.
  const paths = await directories();
  const seed = await InProcessAgentClient.open({
    cwd: paths.workspaceDirectory,
    stateDirectory: paths.stateDirectory,
  });
  const review = await seed.getWorkspaceReview();
  await seed.resolveWorkspaceTrust({
    commandId: "command-trust",
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
  await seed.close();
  const trustDirectory = join(paths.stateDirectory, "workspace-trust", "v1");
  const trustName = (await readdir(trustDirectory))[0];
  if (trustName === undefined) throw new Error("Expected a trust record.");
  await writeFile(join(trustDirectory, trustName), '{"version":', "utf8");

  // When: onboarding reopens from the corrupt registry.
  const fixture = await setup(100, 30, paths);
  try {
    const frame = fixture.renderer.captureCharFrame();

    // Then: the view fails closed and explains the explicit recovery action.
    expect(frame).toContain("trust: restricted");
    expect(frame).toContain("notice: The stored workspace trust decision is invalid");
    expect(frame).toContain("recovery: Review this workspace and explicitly choose trust");
    expect(frame).not.toContain("outcome: succeeded");
    expect(await readdir(join(paths.stateDirectory, "runs")).catch(() => [])).toHaveLength(0);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("denial stays blocked at 60x20 and creates no effect receipt", async () => {
  // Given: a trusted selected action in the minimum supported viewport.
  const fixture = await setup(60, 20);
  try {
    await trustWorkspace(fixture);
    await enterTask(fixture);
    expect(fixture.renderer.captureCharFrame()).toContain("Run the deterministic fake task");

    // When: the operator denies the exact action.
    const changed = fixture.views.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("d");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    // Then: no success truth or fake-host receipt appears.
    const frame = fixture.renderer.captureCharFrame();
    expect(frame).not.toContain("outcome: succeeded");
    const receipts = await readdir(
      join(fixture.paths.stateDirectory, "runs", "run-1", "receipts"),
    ).catch(() => []);
    expect(receipts).toHaveLength(0);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});
