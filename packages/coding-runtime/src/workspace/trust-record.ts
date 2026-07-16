import { randomUUID } from "node:crypto";
import { lstat, open, rename, rm } from "node:fs/promises";

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
    revision: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    decidedAt: Type.String({ maxLength: 128, minLength: 1 }),
  },
  closed,
);
const recordValidator = Schema.Compile(WorkspaceTrustRecordSchema);
const trustRecordByteLimit = 4_096;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

export class TrustRecordWriteError extends Error {
  readonly name = "TrustRecordWriteError";
}

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

export function invalidLoadedTrust(): LoadedTrust {
  return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
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
    const before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > trustRecordByteLimit
    ) {
      return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
    }
    const handle = await open(path, "r");
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size
      ) {
        return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
      }
      const bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(
          bytes,
          offset,
          Math.min(4_096, bytes.length - offset),
          offset,
        );
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      const afterHandle = await handle.stat();
      const afterPath = await lstat(path);
      if (
        offset !== bytes.length ||
        afterHandle.nlink !== 1 ||
        afterPath.nlink !== 1 ||
        afterHandle.dev !== before.dev ||
        afterHandle.ino !== before.ino ||
        afterHandle.size !== before.size ||
        afterPath.dev !== before.dev ||
        afterPath.ino !== before.ino ||
        afterPath.size !== before.size
      ) {
        return { decision: "restricted", notice: invalidTrustNotice(), revision: 0 };
      }
      source = fatalUtf8Decoder.decode(bytes);
    } finally {
      await handle.close();
    }
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
  const source = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(source, "utf8") > trustRecordByteLimit) {
    throw new TrustRecordWriteError("Workspace trust record exceeds the byte limit.");
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(source, "utf8");
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
