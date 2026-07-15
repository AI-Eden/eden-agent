import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProductError } from "@eden/contracts";
import Type from "typebox";
import Schema from "typebox/schema";

const closed = { additionalProperties: false } as const;
const identifier = () => Type.String({ maxLength: 256, minLength: 1 });
const WorkspaceTrustRecordSchema = Type.Object(
  {
    version: Type.Literal(1),
    workspaceId: identifier(),
    canonicalRoot: Type.String({ maxLength: 4_096, minLength: 1 }),
    decision: Type.Union([Type.Literal("trusted"), Type.Literal("restricted")]),
    revision: Type.Integer({ minimum: 1 }),
    decidedAt: Type.String({ maxLength: 128, minLength: 1 }),
  },
  closed,
);
const recordValidator = Schema.Compile(WorkspaceTrustRecordSchema);

export type WorkspaceTrustRecord = Type.Static<typeof WorkspaceTrustRecordSchema>;
export type LoadedTrust = {
  readonly decision: WorkspaceTrustRecord["decision"];
  readonly notice: ProductError | null;
  readonly revision: number;
};
type TrustWorkspaceIdentity = {
  readonly canonicalRoot: string;
  readonly workspaceId: string;
};

function invalidTrustNotice(): ProductError {
  return {
    code: "trust_state_invalid",
    message: "The stored workspace trust decision is invalid and was ignored.",
    recoverability: "reconfigure",
    suggestedActions: [
      "Review this workspace and explicitly choose trust or restricted mode again.",
    ],
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function loadTrust(
  path: string,
  workspace: TrustWorkspaceIdentity,
): Promise<LoadedTrust> {
  let source: string;
  try {
    if (!(await lstat(path)).isFile()) {
      return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
    }
    source = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { decision: "restricted", notice: null, revision: 0 };
    }
    return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
    }
    throw error;
  }
  if (
    !recordValidator.Check(value) ||
    value.workspaceId !== workspace.workspaceId ||
    value.canonicalRoot !== workspace.canonicalRoot
  ) {
    return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
  }
  return { decision: value.decision, notice: null, revision: value.revision };
}

export async function writeTrustRecord(path: string, record: WorkspaceTrustRecord): Promise<void> {
  const directory = resolve(path, "..");
  await mkdir(directory, { mode: 0o700, recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
