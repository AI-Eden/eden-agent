import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InProcessAgentClient } from "@eden/coding-runtime";
import type { ProductView } from "@eden/contracts";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { EdenTuiApp } from "../src/tui.tsx";

const workspace = {
  name: "eden-agent",
  trust: "trusted",
  workspaceId: "workspace-eden-agent",
} as const;

async function setup(width = 100, height = 30) {
  const stateDirectory = await mkdtemp(join(tmpdir(), "eden-tui-"));
  const client = await InProcessAgentClient.open({
    cwd: ".",
    runId: "run-1",
    stateDirectory,
    workspace,
  });
  let resolveNextView: ((view: ProductView) => void) | undefined;
  const nextView = () =>
    new Promise<ProductView>((resolve) => {
      if (resolveNextView !== undefined) throw new Error("A view waiter is already active.");
      resolveNextView = resolve;
    });
  const renderer = await testRender(
    <EdenTuiApp
      client={client}
      onViewChange={(view) => {
        resolveNextView?.(view);
        resolveNextView = undefined;
      }}
      runId="run-1"
    />,
    { height, width },
  );
  await act(async () => renderer.flush());
  return { client, nextView, renderer, stateDirectory };
}

async function enterTask(fixture: Awaited<ReturnType<typeof setup>>) {
  await act(async () => fixture.renderer.mockInput.typeText("Index the fake workspace"));
  const viewChanged = fixture.nextView();
  await act(async () => {
    fixture.renderer.mockInput.pressEnter();
    await viewChanged;
  });
  await act(async () => fixture.renderer.flush());
  expect(fixture.renderer.captureCharFrame()).toContain("approval: pending");
}

test("the real client drives task entry, attributable approval, and verifier success", async () => {
  // Given: the production TUI consumes a real in-process client in a medium terminal.
  const fixture = await setup();
  try {
    await enterTask(fixture);
    const approvalFrame = fixture.renderer.captureCharFrame();

    // When: the displayed fake action is approved with its documented key.
    const viewChanged = fixture.nextView();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("a");
      await viewChanged;
    });
    await act(async () => fixture.renderer.flush());
    const terminalFrame = fixture.renderer.captureCharFrame();

    // Then: exact authority facts and verifier evidence come from the product view.
    expect(approvalFrame).toContain("Run the deterministic fake task");
    expect(approvalFrame).toContain("cwd: .");
    expect(approvalFrame).toContain("scope: R1 demo state directory only");
    expect(terminalFrame).toContain("evidence: run-1:fake-evidence");
    expect(terminalFrame).toContain("check: passed");
    expect(terminalFrame).toContain("phase.progress");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("denial stays blocked at 60x20 and creates no effect receipt", async () => {
  // Given: the selected action remains visible in the minimum supported viewport.
  const fixture = await setup(60, 20);
  try {
    await enterTask(fixture);
    expect(fixture.renderer.captureCharFrame()).toContain("Run the deterministic fake task");

    // When: the operator denies the exact action.
    const viewChanged = fixture.nextView();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("d");
      await viewChanged;
    });
    await act(async () => fixture.renderer.flush());

    // Then: no executing/success truth or fake-host receipt appears.
    const frame = fixture.renderer.captureCharFrame();
    expect(frame).not.toContain("outcome: succeeded");
    const receipts = await readdir(join(fixture.stateDirectory, "runs", "run-1", "receipts")).catch(
      () => [],
    );
    expect(receipts).toHaveLength(0);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});
