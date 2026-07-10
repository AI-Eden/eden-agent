export interface ModelDriver {
  readonly id: string;
  complete(request: unknown, signal: AbortSignal): Promise<unknown>;
}

export class FakeModelDriver implements ModelDriver {
  readonly id = "fake";

  async complete(request: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    return { request, output: "fake-response" };
  }
}

