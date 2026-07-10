export interface WorkspaceSnapshot {
  readonly root: string;
  readonly revision: string | null;
  readonly dirty: boolean;
  readonly capturedAt: string;
}
