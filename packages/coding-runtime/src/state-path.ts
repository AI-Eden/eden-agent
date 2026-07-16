import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export class StatePathError extends Error {
  readonly name = "StatePathError";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function containsPath(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function validateSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    throw new StatePathError("State path contains an invalid segment.");
  }
}

async function requireDirectory(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new StatePathError("State path contains a non-directory component.");
  }
}

async function assertContained(root: string, candidate: string): Promise<void> {
  const [canonicalRoot, canonicalCandidate] = await Promise.all([
    realpath(root),
    realpath(candidate),
  ]);
  if (!containsPath(canonicalRoot, canonicalCandidate)) {
    throw new StatePathError("State path escapes the configured state directory.");
  }
}

export async function inspectStateSubdirectory(
  root: string,
  segments: readonly string[],
): Promise<"missing" | "ready"> {
  let current = root;
  try {
    await requireDirectory(current);
    for (const segment of segments) {
      validateSegment(segment);
      current = join(current, segment);
      await requireDirectory(current);
    }
    await assertContained(root, current);
    return "ready";
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "missing";
    if (error instanceof StatePathError) throw error;
    throw new StatePathError("State path is unavailable.");
  }
}

export async function ensureStateSubdirectory(
  root: string,
  segments: readonly string[],
): Promise<string> {
  let current = root;
  try {
    await requireDirectory(current);
    for (const segment of segments) {
      validateSegment(segment);
      current = join(current, segment);
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!(isNodeError(error) && error.code === "EEXIST")) throw error;
      }
      await requireDirectory(current);
    }
    await assertContained(root, current);
    return current;
  } catch (error) {
    if (error instanceof StatePathError) throw error;
    throw new StatePathError("State path is unavailable.");
  }
}

export async function allocateStateSubdirectory(
  root: string,
  parentSegments: readonly string[],
  leaf: string,
): Promise<string> {
  validateSegment(leaf);
  const parent = await ensureStateSubdirectory(root, parentSegments);
  const path = join(parent, leaf);
  await mkdir(path, { mode: 0o700 });
  await requireDirectory(path);
  await assertContained(root, path);
  return path;
}
