import { type FileHandle, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";

import { decodeKernelEvent, type KernelEffect, type KernelEvent } from "@eden/kernel";

import type { EffectHost, ReconciliationResult } from "./runtime.ts";

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function receiptName(effectId: string): string {
  return `${Buffer.from(effectId).toString("base64url")}.json`;
}

function observationFor(effect: KernelEffect): KernelEvent {
  switch (effect.type) {
    case "fake.action.execute":
      return { effectId: effect.effectId, type: "fake.action.completed" };
    case "fake.verification.run":
      return {
        effectId: effect.effectId,
        evidenceRef: `${effect.runId}:fake-evidence`,
        passed: true,
        type: "verification.completed",
      };
  }
}

function observationMatches(effect: KernelEffect, observation: KernelEvent): boolean {
  switch (effect.type) {
    case "fake.action.execute":
      return (
        observation.type === "fake.action.completed" && observation.effectId === effect.effectId
      );
    case "fake.verification.run":
      return (
        observation.type === "verification.completed" && observation.effectId === effect.effectId
      );
  }
}

export class FakeToolHost implements EffectHost {
  private readonly receiptsDirectory: string;

  constructor(receiptsDirectory: string) {
    this.receiptsDirectory = receiptsDirectory;
  }

  async reconcile(effect: KernelEffect): Promise<ReconciliationResult> {
    const path = join(this.receiptsDirectory, receiptName(effect.effectId));
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      return isMissingFile(error) ? { status: "not-started" } : { status: "unknown" };
    }
    try {
      const value: unknown = JSON.parse(content);
      if (
        typeof value !== "object" ||
        value === null ||
        !("effectId" in value) ||
        !("observation" in value)
      ) {
        return { status: "unknown" };
      }
      if (value.effectId !== effect.effectId) {
        return { status: "unknown" };
      }
      const decoded = decodeKernelEvent(value.observation);
      if (!decoded.ok || !observationMatches(effect, decoded.value)) {
        return { status: "unknown" };
      }
      return { observation: decoded.value, status: "completed" };
    } catch {
      return { status: "unknown" };
    }
  }

  async execute(effect: KernelEffect): Promise<KernelEvent> {
    const reconciled = await this.reconcile(effect);
    if (reconciled.status === "completed") {
      return reconciled.observation;
    }
    if (reconciled.status === "unknown") {
      throw new Error("Cannot execute an effect with an unknown receipt state.");
    }
    await mkdir(this.receiptsDirectory, { recursive: true });
    const observation = observationFor(effect);
    const path = join(this.receiptsDirectory, receiptName(effect.effectId));
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, "wx");
      await handle.writeFile(
        `${JSON.stringify({ effectId: effect.effectId, observation })}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      const raced = await this.reconcile(effect);
      if (raced.status === "completed") {
        return raced.observation;
      }
      throw new Error("Concurrent receipt creation did not produce a valid receipt.");
    } finally {
      await handle?.close();
    }
    return observation;
  }
}
