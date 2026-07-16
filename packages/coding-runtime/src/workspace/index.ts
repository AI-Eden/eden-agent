export interface WorkspaceSnapshot {
  readonly root: string;
  readonly revision: string | null;
  readonly dirty: boolean;
  readonly capturedAt: string;
}

export {
  resolveWorkspaceIdentity,
  type WorkspaceClock,
  type WorkspaceIdentity,
  WorkspaceTrustError,
  WorkspaceTrustService,
  type WorkspaceTrustServiceOptions,
} from "./trust-store.ts";
export type { WorkspaceLockTimer } from "./workspace-lock.ts";
