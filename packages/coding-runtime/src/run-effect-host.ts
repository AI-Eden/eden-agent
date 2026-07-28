import type { KernelEffect, KernelEvent } from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers/model-step";

import type { FakeToolHost } from "./fake-tool-host.ts";
import type { EffectHost, ReconciliationResult } from "./runtime.ts";
import type { SafeActuationEffectHost } from "./safe-actuation-host.ts";

export class RunEffectHost implements EffectHost {
  readonly #fake: FakeToolHost;
  readonly #safe: SafeActuationEffectHost;

  constructor(fake: FakeToolHost, safe: SafeActuationEffectHost) {
    this.#fake = fake;
    this.#safe = safe;
  }

  execute(effect: KernelEffect, signal?: AbortSignal): Promise<KernelEvent> {
    return effect.type === "anchor_edit.prepare" ||
      effect.type === "anchor_edit.execute" ||
      effect.type === "review.eden_patch.capture" ||
      effect.type === "review.git_snapshot.capture" ||
      effect.type === "review.git_check.capture"
      ? this.#safe.execute(effect, signal)
      : this.#fake.execute(effect, signal);
  }

  reconcile(effect: KernelEffect): Promise<ReconciliationResult> {
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
