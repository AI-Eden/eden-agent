import { join } from "node:path";

import type { ProductCommand, ProductError, ProductView, RunId } from "@eden/contracts";
import type { ModelDriver } from "@eden/providers/fake";
import type { ModelStepDriver, ModelVisibleTextListener } from "@eden/providers/model-step";

import { AnchorEditService } from "./anchor-edit.ts";
import { DockerCliDoctorPort } from "./docker-doctor.ts";
import { FakeToolHost } from "./fake-tool-host.ts";
import { GitReviewService } from "./git-review.ts";
import { FileJournal } from "./journal/index.ts";
import { NativeProcessRunner } from "./native-process.ts";
import { RepositoryCheckEffectHost } from "./repository-check-effect-host.ts";
import { DockerCliRepositoryCheckPort } from "./repository-check-runner.ts";
import { RepositoryCheckSnapshotService } from "./repository-check-snapshot.ts";
import { RunCommandService } from "./run-command.ts";
import { RunEffectHost } from "./run-effect-host.ts";
import { type RuntimeClock, RuntimeEngine, type RuntimeIdSource } from "./runtime.ts";
import { SafeActuationEffectHost } from "./safe-actuation-host.ts";
import type { RepositoryToolServiceOptions } from "./tools/index.ts";
import { WriteFileService } from "./write-file.ts";

export type RunSession = {
  readonly engine: RuntimeEngine;
  readonly journal: FileJournal;
  readonly runId: RunId;
};

export class AgentClientError extends Error {
  readonly name = "AgentClientError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

export function clientError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "fatal",
  suggestedAction = message,
): AgentClientError {
  return new AgentClientError({
    code,
    message,
    recoverability,
    suggestedActions: [suggestedAction],
  });
}

export function assertCurrentRevision(
  command: Exclude<ProductCommand, { readonly type: "run.start" }>,
  view: ProductView,
): void {
  if (command.runId !== view.runId) {
    throw clientError("run_not_found", `Run ${command.runId} is not owned by this client.`);
  }
  if (command.expectedRevision !== view.revision) {
    throw clientError("stale_revision", "The command revision is stale.", "retry");
  }
}

export function runDirectoryPath(
  stateDirectory: string,
  workspaceId: string,
  runId: RunId,
): string {
  return join(stateDirectory, "runs", "v1", workspaceId, runId);
}

export function journalPath(stateDirectory: string, workspaceId: string, runId: RunId): string {
  return join(runDirectoryPath(stateDirectory, workspaceId, runId), "journal.jsonl");
}

export async function openRunSession(
  runId: RunId,
  stateDirectory: string,
  workspaceId: string,
  clock: RuntimeClock,
  idSource: RuntimeIdSource,
  cwd: string,
  create: boolean,
  modelDriver?: ModelDriver,
  repositoryToolOptions: Omit<RepositoryToolServiceOptions, "workspaceRoot"> = {},
  repositoryCheckDockerContext?: string,
  modelStepDriver?: ModelStepDriver,
  onVisibleText?: ModelVisibleTextListener,
): Promise<RunSession> {
  const runDirectory = runDirectoryPath(stateDirectory, workspaceId, runId);
  const journal = await FileJournal.open(journalPath(stateDirectory, workspaceId, runId), runId, {
    create,
    profile: modelStepDriver === undefined ? "r2" : "usable_coding_v1",
  });
  const engine = await RuntimeEngine.open(
    journal,
    new RunEffectHost(
      new FakeToolHost(
        join(runDirectory, "receipts"),
        cwd,
        modelDriver,
        repositoryToolOptions,
        modelStepDriver,
        onVisibleText,
      ),
      new SafeActuationEffectHost(
        new AnchorEditService({
          ...(repositoryToolOptions.gitExecutable === undefined
            ? {}
            : { gitExecutable: repositoryToolOptions.gitExecutable }),
          ...(repositoryToolOptions.nativeProcess === undefined
            ? {}
            : { nativeProcess: repositoryToolOptions.nativeProcess }),
          stateDirectory,
          workspaceRoot: cwd,
        }),
        { now: () => clock.now().toISOString() },
        new GitReviewService({
          ...repositoryToolOptions,
          now: () => clock.now().toISOString(),
          workspaceRoot: cwd,
        }),
        new WriteFileService({
          stateDirectory,
          workspaceRoot: cwd,
        }),
        new RunCommandService({
          nativeProcess: repositoryToolOptions.nativeProcess ?? new NativeProcessRunner(),
          now: () => clock.now().toISOString(),
          workspaceRoot: cwd,
        }),
      ),
      new RepositoryCheckEffectHost({
        clock: () => clock.now().toISOString(),
        doctor: new DockerCliDoctorPort({
          cwd,
          ...(repositoryCheckDockerContext === undefined
            ? {}
            : { dockerContext: repositoryCheckDockerContext }),
          nativeProcess: repositoryToolOptions.nativeProcess ?? new NativeProcessRunner(),
        }),
        execution: new DockerCliRepositoryCheckPort({
          cwd,
          ...(repositoryCheckDockerContext === undefined
            ? {}
            : { dockerContext: repositoryCheckDockerContext }),
          nativeProcess: repositoryToolOptions.nativeProcess ?? new NativeProcessRunner(),
        }),
        id: () => `receipt-${idSource.next()}`,
        snapshot: new RepositoryCheckSnapshotService({
          ...(repositoryToolOptions.gitExecutable === undefined
            ? {}
            : { gitExecutable: repositoryToolOptions.gitExecutable }),
          ...(repositoryToolOptions.nativeProcess === undefined
            ? {}
            : { nativeProcess: repositoryToolOptions.nativeProcess }),
          stateDirectory,
          workspaceRoot: cwd,
        }),
        stateDirectory,
      }),
    ),
    clock,
    idSource,
  );
  return { engine, journal, runId };
}
