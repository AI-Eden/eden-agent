import type { KernelEffect, KernelEvent } from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers/model-step";

import type { FakeToolHost } from "./fake-tool-host.ts";
import type { RepositoryCheckEffectHost } from "./repository-check-effect-host.ts";
import type {
  EffectExecutionControl,
  EffectHost,
  EffectObservationListener,
  EffectReconciliationContext,
  ReconciliationResult,
} from "./runtime.ts";
import type { SafeActuationEffectHost } from "./safe-actuation-host.ts";

export class RunEffectHost implements EffectHost {
  readonly #fake: FakeToolHost;
  readonly #safe: SafeActuationEffectHost;
  readonly #repositoryCheck: RepositoryCheckEffectHost | undefined;

  constructor(
    fake: FakeToolHost,
    safe: SafeActuationEffectHost,
    repositoryCheck?: RepositoryCheckEffectHost,
  ) {
    this.#fake = fake;
    this.#safe = safe;
    this.#repositoryCheck = repositoryCheck;
  }

  execute(
    effect: KernelEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
    control?: EffectExecutionControl,
  ): Promise<KernelEvent> {
    if (
      this.#repositoryCheck !== undefined &&
      (effect.type === "repository_check.prepare" || effect.type === "repository_check.execute")
    ) {
      return this.#repositoryCheck.execute(effect, signal, observe, control);
    }
    return effect.type === "anchor_edit.prepare" ||
      effect.type === "anchor_edit.execute" ||
      effect.type === "review.eden_patch.capture" ||
      effect.type === "review.git_snapshot.capture" ||
      effect.type === "review.git_check.capture"
      ? this.#safe.execute(effect, signal)
      : this.#fake.execute(effect, signal);
  }

  reconcile(
    effect: KernelEffect,
    observe?: EffectObservationListener,
    context?: EffectReconciliationContext,
  ): Promise<ReconciliationResult> {
    if (
      this.#repositoryCheck !== undefined &&
      (effect.type === "repository_check.prepare" || effect.type === "repository_check.execute")
    ) {
      return this.#repositoryCheck.reconcile(effect, observe, context);
    }
    return effect.type === "anchor_edit.prepare" ||
      effect.type === "anchor_edit.execute" ||
      effect.type === "review.eden_patch.capture" ||
      effect.type === "review.git_snapshot.capture" ||
      effect.type === "review.git_check.capture"
      ? this.#safe.reconcile(effect)
      : this.#fake.reconcile(effect);
  }

  executeModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
    signal?: AbortSignal,
  ): Promise<KernelEvent> {
    return this.#fake.executeModelAttempt(effect, request, signal);
  }

  reconcileModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    attemptId: string,
  ): Promise<ReconciliationResult> {
    return this.#fake.reconcileModelAttempt(effect, attemptId);
  }
}
