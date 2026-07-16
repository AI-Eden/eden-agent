import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";
import {
  type AgentClient,
  availableRunSummary,
  type ProductView,
  type RunCatalog,
  type RunId,
  type RunInspection,
  readOnlyRunInspection,
  trustedWorkspaceReview,
  type WorkspaceReview,
} from "@eden/contracts";
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

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === null) throw new Error("Deferred promise is unavailable.");
      resolvePromise(value);
    },
  };
}

function rejectable<T>() {
  let rejectPromise: ((reason: unknown) => void) | null = null;
  const promise = new Promise<T>((_resolve, reject) => {
    rejectPromise = reject;
  });
  return {
    promise,
    reject(reason: unknown) {
      if (rejectPromise === null) throw new Error("Rejectable promise is unavailable.");
      rejectPromise(reason);
    },
  };
}

function historyCatalog(count: number): RunCatalog {
  return {
    entries: Array.from({ length: count }, (_, index) => ({
      ...availableRunSummary,
      runId: `run-history-${index.toString().padStart(3, "0")}`,
      task: `History task ${index.toString().padStart(3, "0")}`,
    })),
    notices: [],
    protocolVersion: 1,
    truncated: false,
    workspace: trustedWorkspaceReview.workspace,
  };
}

function historyInspection(runId: RunId): RunInspection {
  const summary = {
    ...readOnlyRunInspection.summary,
    runId,
    task: `Inspection ${runId}`,
  };
  return {
    ...readOnlyRunInspection,
    summary,
    view: { ...readOnlyRunInspection.view, runId },
  };
}

async function captureVisualEvidence(name: string, frame: string) {
  const directory = process.env.EDEN_TUI_CAPTURE_DIR;
  if (directory === undefined) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), frame, "utf8");
}

function historyClient(catalog: RunCatalog) {
  const catalogRequests = queue<true>();
  const requests = queue<{
    readonly deferred: ReturnType<typeof deferred<RunInspection>>;
    readonly runId: RunId;
    readonly signal: AbortSignal | undefined;
  }>();
  const client: AgentClient = {
    close: async () => undefined,
    getRunCatalog: async () => {
      await catalogRequests.take();
      return catalog;
    },
    getSnapshot: async () => {
      throw new Error("No active run.");
    },
    getWorkspaceReview: async () => trustedWorkspaceReview,
    inspectRun: (runId, options) => {
      const result = deferred<RunInspection>();
      requests.push({ deferred: result, runId, signal: options?.signal });
      return result.promise;
    },
    resolveWorkspaceTrust: async () => trustedWorkspaceReview,
    submit: async () => {
      throw new Error("No mutable command expected.");
    },
    subscribe: async function* () {},
  };
  return { client, releaseCatalog: () => catalogRequests.push(true), requests };
}

async function setup(width = 100, height = 30, paths?: Awaited<ReturnType<typeof directories>>) {
  const fixturePaths = paths ?? (await directories());
  const client = await InProcessAgentClient.open({
    cwd: fixturePaths.workspaceDirectory,
    idSource: ids(
      "run-1",
      "event-0",
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
      "event-7",
    ),
    stateDirectory: fixturePaths.stateDirectory,
  });
  const initialWorkspaceReview = await client.getWorkspaceReview();
  const reviews = queue<WorkspaceReview | null>();
  const catalogs = queue<RunCatalog>();
  const inspections = queue<RunInspection>();
  const views = queue<ProductView>();
  const renderer = await testRender(
    <EdenTuiApp
      client={client}
      initialWorkspaceReview={initialWorkspaceReview}
      onRunCatalogChange={(catalog) => catalogs.push(catalog)}
      onRunInspectionChange={(inspection) => inspections.push(inspection)}
      onViewChange={(view) => views.push(view)}
      onWorkspaceReviewChange={(review) => reviews.push(review)}
    />,
    { height, width },
  );
  await act(async () => {
    await reviews.take();
    await catalogs.take();
    renderer.flush();
  });
  return { catalogs, client, inspections, paths: fixturePaths, renderer, reviews, views };
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
  const fixture = await setup();
  try {
    const initial = fixture.renderer.captureCharFrame();
    const changed = fixture.reviews.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("r");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    const frame = fixture.renderer.captureCharFrame();
    expect(initial).toContain(await realpath(fixture.paths.workspaceDirectory));
    expect(frame).toContain("trust: restricted");
    expect(frame).toContain("repository: read disabled · write denied");
    expect(frame).toContain("network denied · sandbox not-configured");
    expect(frame).toContain("Trust does not approve actions");
    expect(await readdir(join(fixture.paths.stateDirectory, "runs")).catch(() => [])).toHaveLength(
      0,
    );
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("the real client drives trust, task entry, separate approval, and verifier success", async () => {
  const fixture = await setup();
  try {
    await trustWorkspace(fixture);
    await enterTask(fixture);
    const approvalFrame = fixture.renderer.captureCharFrame();

    const changed = fixture.views.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("a");
      await changed;
    });
    await act(async () => fixture.renderer.flush());
    const terminalFrame = fixture.renderer.captureCharFrame();

    expect(approvalFrame).toContain("trust: trusted");
    expect(approvalFrame).toContain("Run the deterministic fake task");
    expect(approvalFrame).toContain(`cwd: ${await realpath(fixture.paths.workspaceDirectory)}`);
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
  const fixture = await setup(60, 20, paths);
  try {
    expect(fixture.renderer.captureCharFrame()).toContain("trust: trusted");
    expect(fixture.renderer.captureCharFrame()).toContain("Task");
    const changed = fixture.reviews.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("r");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    const frame = fixture.renderer.captureCharFrame();
    expect(frame).toContain("trust: restricted");
    expect(frame).not.toContain("Describe the fake task");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("a concurrent revoke refreshes stale trusted UI after start is blocked", async () => {
  const fixture = await setup(60, 20);
  try {
    await trustWorkspace(fixture);
    await act(async () => fixture.renderer.mockInput.pressEnter());
    await act(async () => fixture.renderer.mockInput.typeText("Must not start after revoke"));
    const revoker = await InProcessAgentClient.open({
      cwd: fixture.paths.workspaceDirectory,
      stateDirectory: fixture.paths.stateDirectory,
    });
    const current = await revoker.getWorkspaceReview();
    await revoker.resolveWorkspaceTrust({
      commandId: "command-concurrent-revoke",
      decision: "restrict",
      expectedRevision: current.revision,
      protocolVersion: 1,
      type: "workspace.trust.resolve",
      workspaceId: current.workspace.workspaceId,
    });
    await revoker.close();

    const invalidated = fixture.reviews.take();
    const changed = fixture.reviews.take();
    await act(async () => {
      const pressing = fixture.renderer.mockInput.pressEnter();
      await invalidated;
      await changed;
      await pressing;
    });
    await act(async () => fixture.renderer.flush());

    const frame = fixture.renderer.captureCharFrame();
    expect(frame).toContain("trust: restricted");
    expect(frame).toContain("error: Trust this exact workspace before starting a t...");
    expect(frame).not.toContain("Describe the fake task");
    expect(await readdir(join(fixture.paths.stateDirectory, "runs")).catch(() => [])).toHaveLength(
      0,
    );
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("a stale trust control invalidates cached authority before refreshing", async () => {
  const fixture = await setup(60, 20);
  try {
    await trustWorkspace(fixture);
    const revoker = await InProcessAgentClient.open({
      cwd: fixture.paths.workspaceDirectory,
      stateDirectory: fixture.paths.stateDirectory,
    });
    const current = await revoker.getWorkspaceReview();
    await revoker.resolveWorkspaceTrust({
      commandId: "command-revoke-before-stale-control",
      decision: "restrict",
      expectedRevision: current.revision,
      protocolVersion: 1,
      type: "workspace.trust.resolve",
      workspaceId: current.workspace.workspaceId,
    });
    await revoker.close();

    await act(async () => {
      fixture.renderer.mockInput.pressKey("r");
      await delay(100);
    });
    await act(async () => fixture.renderer.flush());

    const frame = fixture.renderer.captureCharFrame();
    expect(frame).toContain("trust: restricted");
    expect(frame).not.toContain("trust: trusted");
    expect(frame).not.toContain("Describe the fake task");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("a failed authority refresh hides cached trust and task entry", async () => {
  const catalog = historyCatalog(0);
  const catalogRequested = deferred<true>();
  const catalogResult = deferred<RunCatalog>();
  const invalidated = deferred<true>();
  const refreshRequested = deferred<true>();
  const refresh = rejectable<WorkspaceReview>();
  const submitted = deferred<true>();
  const submission = rejectable<ProductView>();
  const client: AgentClient = {
    close: async () => undefined,
    getRunCatalog: () => {
      catalogRequested.resolve(true);
      return catalogResult.promise;
    },
    getSnapshot: async () => {
      throw new Error("No active run.");
    },
    getWorkspaceReview: () => {
      refreshRequested.resolve(true);
      return refresh.promise;
    },
    inspectRun: async () => {
      throw new Error("No historical run.");
    },
    resolveWorkspaceTrust: async () => trustedWorkspaceReview,
    submit: () => {
      submitted.resolve(true);
      return submission.promise;
    },
    subscribe: async function* () {},
  };
  const renderer = await testRender(
    <EdenTuiApp
      client={client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onWorkspaceReviewChange={(review) => {
        if (review === null) invalidated.resolve(true);
      }}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      await catalogRequested.promise;
      catalogResult.resolve(catalog);
    });
    await act(async () => renderer.flush());
    await act(async () => renderer.mockInput.pressEnter());
    await act(async () => renderer.mockInput.typeText("Must fail closed"));
    await act(async () => {
      const pressing = renderer.mockInput.pressEnter();
      await submitted.promise;
      submission.reject(
        new AgentClientError({
          code: "workspace_trust_required",
          message: "Trust this exact workspace before starting a task.",
          recoverability: "ask-user",
          suggestedActions: ["Review the workspace and explicitly grant trust."],
        }),
      );
      await invalidated.promise;
      await refreshRequested.promise;
      refresh.reject(new Error("Refresh failed."));
      await pressing;
    });
    await act(async () => renderer.flush());

    const frame = renderer.captureCharFrame();
    expect(frame).toContain("Workspace authority could not be refreshed");
    expect(frame).toContain("Loading workspace review");
    expect(frame).not.toContain("trust: trusted");
    expect(frame).not.toContain("Describe the fake task");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("workspace identity change invalidates cached authority without refreshing the old root", async () => {
  let refreshes = 0;
  const catalog = historyCatalog(0);
  const catalogRequested = deferred<true>();
  const catalogResult = deferred<RunCatalog>();
  const invalidated = deferred<true>();
  const submitted = deferred<true>();
  const submission = rejectable<ProductView>();
  const client: AgentClient = {
    close: async () => undefined,
    getRunCatalog: () => {
      catalogRequested.resolve(true);
      return catalogResult.promise;
    },
    getSnapshot: async () => {
      throw new Error("No active run.");
    },
    getWorkspaceReview: async () => {
      refreshes += 1;
      return trustedWorkspaceReview;
    },
    inspectRun: async () => {
      throw new Error("No historical run.");
    },
    resolveWorkspaceTrust: async () => trustedWorkspaceReview,
    submit: () => {
      submitted.resolve(true);
      return submission.promise;
    },
    subscribe: async function* () {},
  };
  const renderer = await testRender(
    <EdenTuiApp
      client={client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onWorkspaceReviewChange={(review) => {
        if (review === null) invalidated.resolve(true);
      }}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      await catalogRequested.promise;
      catalogResult.resolve(catalog);
    });
    await act(async () => renderer.flush());
    await act(async () => renderer.mockInput.pressEnter());
    await act(async () => renderer.mockInput.typeText("Retargeted workspace"));
    await act(async () => {
      const pressing = renderer.mockInput.pressEnter();
      await submitted.promise;
      submission.reject(
        new AgentClientError({
          code: "workspace_identity_changed",
          message: "The workspace identity changed before the operation was applied.",
          recoverability: "ask-user",
          suggestedActions: ["Review the current workspace identity before continuing."],
        }),
      );
      await invalidated.promise;
      await pressing;
    });
    await act(async () => renderer.flush());

    const frame = renderer.captureCharFrame();
    expect(refreshes).toBe(0);
    expect(frame).toContain("Loading workspace review");
    expect(frame).not.toContain("trust: trusted");
    expect(frame).not.toContain("Describe the fake task");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("corrupt trust state stays restricted with actionable recovery", async () => {
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

  const fixture = await setup(100, 30, paths);
  try {
    const frame = fixture.renderer.captureCharFrame();

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
  const fixture = await setup(60, 20);
  try {
    await trustWorkspace(fixture);
    await enterTask(fixture);
    expect(fixture.renderer.captureCharFrame()).toContain("Run the deterministic fake task");

    const changed = fixture.views.take();
    await act(async () => {
      fixture.renderer.mockInput.pressKey("d");
      await changed;
    });
    await act(async () => fixture.renderer.flush());

    const frame = fixture.renderer.captureCharFrame();
    expect(frame).not.toContain("outcome: succeeded");
    const workspaceId = (await fixture.client.getWorkspaceReview()).workspace.workspaceId;
    const receipts = await readdir(
      join(fixture.paths.stateDirectory, "runs", "v1", workspaceId, "run-1", "receipts"),
    ).catch(() => []);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toBe(`${Buffer.from("run-1:fake-model").toString("base64url")}.json`);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("current-workspace history opens an awaiting run as read-only evidence", async () => {
  const paths = await directories();
  const seed = await InProcessAgentClient.open({
    cwd: paths.workspaceDirectory,
    idSource: ids("run-history-1", "event-history-0", "event-history-1", "event-history-2"),
    stateDirectory: paths.stateDirectory,
  });
  const review = await seed.getWorkspaceReview();
  await seed.resolveWorkspaceTrust({
    commandId: "command-trust-history",
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
  await seed.submit({
    commandId: "command-run-history",
    protocolVersion: 1,
    task: "Review historical approval evidence",
    type: "run.start",
  });
  await seed.close();
  const journal = join(
    paths.stateDirectory,
    "runs",
    "v1",
    review.workspace.workspaceId,
    "run-history-1",
    "journal.jsonl",
  );
  const before = await readFile(journal, "utf8");
  const fixture = await setup(60, 20, paths);
  try {
    await act(async () => {
      fixture.renderer.mockInput.pressKey("h");
      await fixture.catalogs.take();
    });
    await act(async () => fixture.renderer.flush());
    const history = fixture.renderer.captureCharFrame();
    expect(history).toContain("Review historical approval");

    await act(async () => {
      fixture.renderer.mockInput.pressEnter();
      await fixture.inspections.take();
    });
    await act(async () => fixture.renderer.flush());
    const inspection = fixture.renderer.captureCharFrame();
    expect(inspection).toContain("read-only history");
    expect(inspection).toContain("run-history-1");
    expect(inspection).toContain("approval: recorded evidence");
    expect(inspection).toContain("continued execution is unavailable in R1");
    expect(inspection).not.toContain("approve: a");
    expect(inspection).not.toContain("deny: d");

    await act(async () => fixture.renderer.mockInput.pressKey("b"));
    await act(async () => fixture.renderer.flush());
    expect(fixture.renderer.captureCharFrame()).toContain("trust: trusted");
    expect(await readFile(journal, "utf8")).toBe(before);
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("plain h stays composer text", async () => {
  const fixture = await setup(60, 20);
  try {
    await trustWorkspace(fixture);
    await act(async () => fixture.renderer.mockInput.pressEnter());
    await act(async () => fixture.renderer.flush());
    await act(async () => fixture.renderer.mockInput.typeText("h"));
    expect(fixture.renderer.captureCharFrame()).not.toContain("Current-workspace history");

    await act(async () => fixture.renderer.mockInput.pressKey("escape"));
    await act(async () => fixture.renderer.flush());
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("an unavailable run remains selectable and recoverable at 60x20", async () => {
  const fixture = await setup(60, 20);
  try {
    const workspaceId = (await fixture.client.getWorkspaceReview()).workspace.workspaceId;
    const corruptJournal = join(
      fixture.paths.stateDirectory,
      "runs",
      "v1",
      workspaceId,
      "run-corrupt-1",
      "journal.jsonl",
    );
    await mkdir(join(corruptJournal, ".."), { recursive: true });
    await writeFile(corruptJournal, '{"journalVersion":\n', "utf8");

    await act(async () => {
      fixture.renderer.mockInput.pressKey("h");
      await fixture.catalogs.take();
    });
    await act(async () => fixture.renderer.flush());
    const history = fixture.renderer.captureCharFrame();
    expect(history).toContain("run-corrupt-1 · unavailable");

    await act(async () => fixture.renderer.mockInput.pressEnter());
    await act(async () => fixture.renderer.flush());
    const frame = fixture.renderer.captureCharFrame();
    await captureVisualEvidence("history-unavailable-60x20.txt", frame);
    expect(frame).toContain("run_history_unavailable");
    expect(frame).toContain("recovery:");
    expect(frame).toContain("b back");
  } finally {
    act(() => fixture.renderer.renderer.destroy());
    await fixture.client.close();
  }
});

test("history keeps the selected row and controls visible across a 100-entry window", async () => {
  const source = historyClient(historyCatalog(100));
  const catalogs = queue<RunCatalog>();
  const inspections = queue<RunInspection>();
  const renderer = await testRender(
    <EdenTuiApp
      client={source.client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onRunCatalogChange={(catalog) => catalogs.push(catalog)}
      onRunInspectionChange={(inspection) => inspections.push(inspection)}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      source.releaseCatalog();
      await catalogs.take();
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
    });
    await act(async () => renderer.flush());
    for (let index = 0; index < 33; index += 1) {
      await act(async () => {
        renderer.mockInput.pressArrow("down");
        await renderer.flush();
      });
    }
    await act(async () => renderer.flush());
    const narrow = renderer.captureCharFrame();
    await captureVisualEvidence("history-window-60x20.txt", narrow);
    expect(narrow).toContain("> History task 033");
    expect(narrow).toContain("of 100");
    expect(narrow).toContain("Up/Down selects");
    expect(narrow).not.toContain("History task 000");

    const requestPromise = source.requests.take();
    await act(async () => renderer.mockInput.pressEnter());
    const request = await requestPromise;
    expect(request.runId).toBe("run-history-033");
    const changed = inspections.take();
    request.deferred.resolve(historyInspection(request.runId));
    await act(async () => changed);
    await act(async () => renderer.flush());
    const inspection = renderer.captureCharFrame();
    await captureVisualEvidence("history-inspection-60x20.txt", inspection);
    expect(inspection).toContain("run-history-033");

    await act(async () => renderer.mockInput.pressKey("b"));
    await act(async () => renderer.flush());
    await act(async () => {
      renderer.resize(100, 30);
      await renderer.flush();
    });
    await act(async () => {
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
      await renderer.flush();
    });
    await act(async () => renderer.flush());
    const wide = renderer.captureCharFrame();
    await captureVisualEvidence("history-window-100x30.txt", wide);
    expect(wide).toContain("> History task 033");
    expect(wide).toContain("of 100");
    expect(wide).toContain("Up/Down selects");
  } finally {
    act(() => renderer.renderer.destroy());
    await source.client.close();
  }
});

test("history reserves 60x20 rows for truncation notice and selected recovery", async () => {
  const base = historyCatalog(99);
  const unavailable: RunCatalog["entries"][number] = {
    availability: "unavailable",
    error: {
      code: "run_history_unavailable",
      message: "The attributed run history is unavailable.",
      recoverability: "reconfigure",
      suggestedActions: ["Inspect or remove the damaged isolated state manually."],
    },
    runId: "run-history-unavailable",
  };
  const catalog: RunCatalog = {
    ...base,
    entries: [...base.entries, unavailable],
    notices: [
      {
        code: "run_history_budget_exceeded",
        message: "The bounded history scan stopped at the R1 budget.",
        recoverability: "retry",
        suggestedActions: ["Narrow the isolated state before retrying."],
      },
    ],
    truncated: true,
  };
  const source = historyClient(catalog);
  const catalogs = queue<RunCatalog>();
  const renderer = await testRender(
    <EdenTuiApp
      client={source.client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onRunCatalogChange={(value) => catalogs.push(value)}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      source.releaseCatalog();
      await catalogs.take();
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
    });
    for (let index = 0; index < 99; index += 1) {
      await act(async () => renderer.mockInput.pressArrow("down"));
    }
    await act(async () => renderer.mockInput.pressEnter());
    await act(async () => renderer.flush());

    const frame = renderer.captureCharFrame();
    await captureVisualEvidence("history-combined-budget-60x20.txt", frame);
    expect(frame).toContain("trust: trusted");
    expect(frame).toContain("Current-workspace history · read-only");
    expect(frame).toContain("of 100");
    expect(frame).toContain("> run-history-unavailable");
    expect(frame).toContain("notice:");
    expect(frame).toContain("History is truncated");
    expect(frame).toContain("run_history_unavailable");
    expect(frame).toContain("recovery:");
    expect(frame).toContain("b back · ^C exits");
  } finally {
    act(() => renderer.renderer.destroy());
    await source.client.close();
  }
});

test("history truncates maximum contract values before 60x20 controls", async () => {
  const longRunId = `run-${"a".repeat(124)}` as RunId;
  const catalog: RunCatalog = {
    entries: [
      { ...availableRunSummary, runId: "run-long-values", task: "界".repeat(2_048) },
      {
        availability: "unavailable",
        error: {
          code: "run_history_unavailable",
          message: "m".repeat(4_096),
          recoverability: "reconfigure",
          suggestedActions: ["r".repeat(512)],
        },
        runId: longRunId,
      },
    ],
    notices: [],
    protocolVersion: 1,
    truncated: false,
    workspace: trustedWorkspaceReview.workspace,
  };
  const source = historyClient(catalog);
  const catalogs = queue<RunCatalog>();
  const inspections = queue<RunInspection>();
  const renderer = await testRender(
    <EdenTuiApp
      client={source.client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onRunCatalogChange={(value) => catalogs.push(value)}
      onRunInspectionChange={(value) => inspections.push(value)}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      source.releaseCatalog();
      await catalogs.take();
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
      await renderer.flush();
    });
    await act(async () => renderer.flush());
    const history = renderer.captureCharFrame();
    expect(history).toContain("> 界界界");
    expect(history).toContain("...");
    expect(history).toContain("Up/Down selects");

    const requestPromise = source.requests.take();
    await act(async () => renderer.mockInput.pressEnter());
    const request = await requestPromise;
    const baseInspection = historyInspection(request.runId);
    const changed = inspections.take();
    request.deferred.resolve({
      ...baseInspection,
      summary: { ...baseInspection.summary, task: "界".repeat(2_048) },
      view: {
        ...baseInspection.view,
        workspace: { ...baseInspection.view.workspace, root: `/${"w".repeat(4_095)}` },
      },
    });
    await act(async () => changed);
    await act(async () => renderer.flush());
    const inspection = renderer.captureCharFrame();
    expect(inspection).toContain("run: run-long-values");
    expect(inspection).toContain("task: 界界界");
    expect(inspection).toContain("b returns · Ctrl+C exits");

    await act(async () => renderer.mockInput.pressKey("b"));
    await act(async () => renderer.mockInput.pressKey("h"));
    source.releaseCatalog();
    await act(async () => catalogs.take());
    await act(async () => renderer.mockInput.pressArrow("down"));
    await act(async () => renderer.mockInput.pressEnter());
    await act(async () => renderer.flush());
    const unavailable = renderer.captureCharFrame();
    expect(unavailable).toContain("run_history_unavailable");
    expect(unavailable).toContain("recovery:");
    expect(unavailable).toContain("b back · ^C exits");
  } finally {
    act(() => renderer.renderer.destroy());
    await source.client.close();
  }
});

test("catalog reload, back, and unmount abort their owned reads", async () => {
  const catalogSignals = queue<AbortSignal>();
  const client: AgentClient = {
    close: async () => undefined,
    getRunCatalog: (options) => {
      const signal = options?.signal;
      if (signal === undefined) throw new Error("Catalog reads must own a cancellation signal.");
      catalogSignals.push(signal);
      return new Promise<RunCatalog>((_resolve, reject) => {
        const abort = () => reject(new Error("catalog-aborted"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    },
    getSnapshot: async () => {
      throw new Error("No active run.");
    },
    getWorkspaceReview: async () => trustedWorkspaceReview,
    inspectRun: async () => {
      throw new Error("No inspection expected.");
    },
    resolveWorkspaceTrust: async () => trustedWorkspaceReview,
    submit: async () => {
      throw new Error("No mutable command expected.");
    },
    subscribe: async function* () {},
  };
  const renderer = await testRender(
    <EdenTuiApp client={client} initialWorkspaceReview={trustedWorkspaceReview} />,
    { height: 20, width: 60 },
  );
  const initial = await catalogSignals.take();
  try {
    await act(async () => renderer.mockInput.pressKey("h"));
    const opened = await catalogSignals.take();
    expect(initial.aborted).toBe(true);

    await act(async () => renderer.mockInput.pressKey("b"));
    expect(opened.aborted).toBe(true);

    await act(async () => renderer.mockInput.pressKey("h"));
    const reopened = await catalogSignals.take();
    act(() => renderer.renderer.destroy());
    expect(reopened.aborted).toBe(true);
  } finally {
    act(() => renderer.renderer.destroy());
    await client.close();
  }
});

test("stale inspections cannot reopen history after selection, back, or out-of-order completion", async () => {
  const source = historyClient(historyCatalog(3));
  const catalogs = queue<RunCatalog>();
  const inspections = queue<RunInspection>();
  const renderer = await testRender(
    <EdenTuiApp
      client={source.client}
      initialWorkspaceReview={trustedWorkspaceReview}
      onRunCatalogChange={(catalog) => catalogs.push(catalog)}
      onRunInspectionChange={(inspection) => inspections.push(inspection)}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => {
      source.releaseCatalog();
      await catalogs.take();
    });
    await act(async () => {
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
      await renderer.flush();
    });
    await act(async () => renderer.mockInput.pressEnter());
    const first = await source.requests.take();
    await act(async () => {
      renderer.mockInput.pressArrow("down");
      await renderer.flush();
    });
    await act(async () => {
      renderer.mockInput.pressEnter();
    });
    const second = await source.requests.take();
    expect(first.signal?.aborted).toBe(true);
    expect(second.runId).toBe("run-history-001");

    const changed = inspections.take();
    second.deferred.resolve(historyInspection(second.runId));
    await act(async () => changed);
    first.deferred.resolve(historyInspection(first.runId));
    await act(async () => renderer.flush());
    expect(renderer.captureCharFrame()).toContain("run-history-001");
    expect(renderer.captureCharFrame()).not.toContain("run-history-000");

    await act(async () => {
      renderer.mockInput.pressKey("b");
      await renderer.flush();
    });
    await act(async () => {
      renderer.mockInput.pressKey("h");
      source.releaseCatalog();
      await catalogs.take();
      await renderer.flush();
    });
    await act(async () => renderer.mockInput.pressEnter());
    const afterBack = await source.requests.take();
    await act(async () => renderer.mockInput.pressKey("b"));
    expect(afterBack.signal?.aborted).toBe(true);
    afterBack.deferred.resolve(historyInspection(afterBack.runId));
    await act(async () => renderer.flush());
    const workspace = renderer.captureCharFrame();
    expect(workspace).toContain("trust: trusted");
    expect(workspace).not.toContain("read-only history");
  } finally {
    act(() => renderer.renderer.destroy());
    await source.client.close();
  }
});
