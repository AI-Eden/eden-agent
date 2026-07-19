import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  type NativeProcessObservation,
  type NativeProcessPort,
  type NativeProcessRequest,
  RepositoryToolService,
} from "@eden/coding-runtime";
import { rgPath } from "@vscode/ripgrep";

const decoder = new TextDecoder();

async function pinnedRipgrep() {
  const applicationDirectory = await mkdtemp(join(tmpdir(), "eden-native-application-"));
  const applicationPath = join(
    applicationDirectory,
    process.platform === "win32" ? "rg.exe" : "rg",
  );
  await copyFile(rgPath, applicationPath);
  if (process.platform !== "win32") await chmod(applicationPath, 0o755);
  const bytes = await readFile(applicationPath);
  return {
    contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    path: applicationPath,
    version: "15.0.0" as const,
  };
}

function searchCall(continuation: number | null = null) {
  return {
    arguments: { continuation, path: ".", pattern: "EDEN_NATIVE_MATCH" },
    name: "search_repository",
    toolCallId: `search-${continuation ?? "start"}`,
  } as const;
}

const gitCall = {
  arguments: {},
  name: "git_status",
  toolCallId: "git-status-1",
} as const;

function runGit(cwd: string, arguments_: readonly string[]): string {
  const result = spawnSync("git", [...arguments_], {
    cwd,
    encoding: "utf8",
    env: {
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  const names = (await readdir(root, { recursive: true })).sort();
  for (const name of names) {
    const path = join(root, name);
    const metadata = await lstat(path);
    hash.update(`${name}\0${metadata.mode}\0${metadata.size}\0`);
    if (metadata.isFile() && !metadata.isSymbolicLink()) hash.update(await readFile(path));
  }
  return hash.digest("hex");
}

class ScriptedNativeProcess implements NativeProcessPort {
  readonly requests: NativeProcessRequest[] = [];
  private readonly observations: NativeProcessObservation[];

  constructor(observations: NativeProcessObservation[]) {
    this.observations = observations;
  }

  async run(request: NativeProcessRequest): Promise<NativeProcessObservation> {
    this.requests.push(request);
    return this.observations.shift() ?? { status: "spawn-failed" };
  }
}

function exited(stdout: string, exitCode = 0, stderr = ""): NativeProcessObservation {
  return {
    exitCode,
    status: "exited",
    stderr: Buffer.from(stderr),
    stdout: Buffer.from(stdout),
  };
}

describe("native repository semantic tools", () => {
  it("searches with the real pinned ripgrep and returns only bounded parsed matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-search-"));
    await writeFile(
      join(root, "alpha.txt"),
      "before\nEDEN_NATIVE_MATCH one\nEDEN_NATIVE_MATCH two EDEN_NATIVE_MATCH\n",
    );
    await writeFile(join(root, "beta.txt"), "EDEN_NATIVE_MATCH three\n");
    const asset = await pinnedRipgrep();
    const service = await RepositoryToolService.open({ ripgrepAsset: asset, workspaceRoot: root });
    const before = await treeDigest(root);

    const result = await service.execute(searchCall());

    assert.equal(result.productData.status, "succeeded");
    assert.equal(result.productData.name, "search_repository");
    if (
      result.productData.status !== "succeeded" ||
      result.productData.name !== "search_repository"
    ) {
      return;
    }
    assert.deepEqual(result.productData.data.matches, [
      { byteColumn: 1, lineNumber: 2, path: "alpha.txt", preview: "EDEN_NATIVE_MATCH one\n" },
      {
        byteColumn: 1,
        lineNumber: 3,
        path: "alpha.txt",
        preview: "EDEN_NATIVE_MATCH two EDEN_NATIVE_MATCH\n",
      },
      {
        byteColumn: 23,
        lineNumber: 3,
        path: "alpha.txt",
        preview: "EDEN_NATIVE_MATCH two EDEN_NATIVE_MATCH\n",
      },
      { byteColumn: 1, lineNumber: 1, path: "beta.txt", preview: "EDEN_NATIVE_MATCH three\n" },
    ]);
    assert.deepEqual(result.productData.data.engine, {
      contentHash: asset.contentHash,
      name: "ripgrep",
      version: "15.0.0",
    });
    assert.equal(result.productData.data.continuation, null);
    assert.equal(result.productData.data.truncated, false);
    assert.equal("rawStdout" in result.productData, false);
    assert.equal("rawStderr" in result.productData, false);
    assert.equal(await treeDigest(root), before);
  });

  it("searches a repository with linked entries without following their external targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-search-linked-"));
    const outside = await mkdtemp(join(tmpdir(), "eden-native-search-outside-"));
    await writeFile(join(root, "inside.txt"), "EDEN_NATIVE_MATCH inside\n");
    await writeFile(join(outside, "outside.txt"), "EDEN_NATIVE_MATCH outside\n");
    await symlink(join(outside, "outside.txt"), join(root, "linked.txt"));
    const service = await RepositoryToolService.open({
      ripgrepAsset: await pinnedRipgrep(),
      workspaceRoot: root,
    });

    const result = await service.execute(searchCall());

    assert.equal(result.productData.status, "succeeded");
    assert.equal(result.productData.name, "search_repository");
    if (
      result.productData.status !== "succeeded" ||
      result.productData.name !== "search_repository"
    ) {
      return;
    }
    assert.deepEqual(result.productData.data.matches, [
      { byteColumn: 1, lineNumber: 1, path: "inside.txt", preview: "EDEN_NATIVE_MATCH inside\n" },
    ]);
    assert.equal(JSON.stringify(result.productData).includes("outside"), false);
  });

  it("paginates real search results at the closed row bound without overlap", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-search-page-"));
    await writeFile(
      join(root, "many.txt"),
      Array.from({ length: 300 }, () => "EDEN_NATIVE_MATCH\n").join(""),
    );
    const service = await RepositoryToolService.open({
      ripgrepAsset: await pinnedRipgrep(),
      workspaceRoot: root,
    });

    const first = await service.execute(searchCall());
    assert.equal(first.productData.status, "succeeded");
    assert.equal(first.productData.name, "search_repository");
    if (
      first.productData.status !== "succeeded" ||
      first.productData.name !== "search_repository"
    ) {
      return;
    }
    assert.equal(first.productData.data.matches.length, 256);
    assert.equal(first.productData.data.continuation, 256);
    assert.equal(first.productData.data.truncated, true);
    const second = await service.execute(searchCall(first.productData.data.continuation));
    assert.equal(second.productData.status, "succeeded");
    assert.equal(second.productData.name, "search_repository");
    if (
      second.productData.status !== "succeeded" ||
      second.productData.name !== "search_repository"
    ) {
      return;
    }
    assert.equal(second.productData.data.matches.length, 44);
    assert.equal(second.productData.data.matches[0]?.lineNumber, 257);
    assert.equal(second.productData.data.continuation, null);
  });

  it("parses real porcelain-v2 NUL status for dirty, renamed, and untracked paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-git-"));
    runGit(root, ["init", "--quiet"]);
    runGit(root, ["config", "user.email", "eden@example.invalid"]);
    runGit(root, ["config", "user.name", "Eden Test"]);
    await writeFile(join(root, "dirty.txt"), "clean\n");
    await writeFile(join(root, "old name.txt"), "rename me\n");
    runGit(root, ["add", "dirty.txt", "old name.txt"]);
    runGit(root, ["commit", "--quiet", "-m", "fixture"]);
    await writeFile(join(root, "dirty.txt"), "changed\n");
    await rename(join(root, "old name.txt"), join(root, "new name.txt"));
    runGit(root, ["add", "old name.txt", "new name.txt"]);
    await writeFile(join(root, "untracked space.txt"), "new\n");
    const before = await treeDigest(join(root, ".git"));

    const oracle = runGit(root, [
      "--no-optional-locks",
      "-c",
      "core.quotepath=false",
      "-c",
      "color.ui=false",
      "-c",
      "core.fsmonitor=false",
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ]);
    assert.match(oracle, /dirty\.txt/u);
    assert.match(oracle, /new name\.txt\0old name\.txt\0/u);
    assert.match(oracle, /untracked space\.txt/u);

    const service = await RepositoryToolService.open({ workspaceRoot: root });
    const result = await service.execute(gitCall);

    assert.equal(result.productData.status, "succeeded");
    assert.equal(result.productData.name, "git_status");
    if (result.productData.status !== "succeeded" || result.productData.name !== "git_status") {
      return;
    }
    assert.deepEqual(result.productData.data.entries, [
      {
        indexStatus: ".",
        kind: "modified",
        originalPath: null,
        path: "dirty.txt",
        worktreeStatus: "M",
      },
      {
        indexStatus: "R",
        kind: "renamed",
        originalPath: "old name.txt",
        path: "new name.txt",
        worktreeStatus: ".",
      },
      {
        indexStatus: "?",
        kind: "untracked",
        originalPath: null,
        path: "untracked space.txt",
        worktreeStatus: "?",
      },
    ]);
    assert.match(result.productData.data.gitVersion, /^\d+\.\d+/u);
    assert.equal("rawStdout" in result.productData, false);
    assert.equal("rawStderr" in result.productData, false);
    assert.equal(await treeDigest(join(root, ".git")), before);
  });

  it("uses frozen native argv and a scrubbed environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-fixed-"));
    await writeFile(join(root, "fixture.txt"), "EDEN_NATIVE_MATCH\n");
    const asset = await pinnedRipgrep();
    process.env.EDEN_SECRET_NATIVE_CANARY = "must-not-cross";
    process.env.GIT_EDITOR = "must-not-cross";
    process.env.GIT_ASKPASS = "must-not-cross";
    try {
      const searchNative = new ScriptedNativeProcess([
        exited("ripgrep 15.0.0\n"),
        exited('{"type":"summary","data":{}}\n'),
      ]);
      const search = await RepositoryToolService.open({
        nativeProcess: searchNative,
        ripgrepAsset: asset,
        workspaceRoot: root,
      });
      assert.equal((await search.execute(searchCall())).productData.status, "succeeded");
      assert.deepEqual(searchNative.requests[1]?.arguments, [
        "--json",
        "--no-config",
        "--color",
        "never",
        "--line-number",
        "--column",
        "--sort",
        "path",
        "--max-columns",
        "4096",
        "--max-columns-preview",
        "--no-follow",
        "--glob",
        "!.git/**",
        "--",
        "EDEN_NATIVE_MATCH",
        ".",
      ]);
      assert.equal(searchNative.requests[1]?.environment.EDEN_SECRET_NATIVE_CANARY, undefined);
      assert.equal(searchNative.requests[1]?.environment.PATH, undefined);

      const gitNative = new ScriptedNativeProcess([exited("git version 2.43.0\n"), exited("")]);
      const git = await RepositoryToolService.open({
        nativeProcess: gitNative,
        workspaceRoot: root,
      });
      assert.equal((await git.execute(gitCall)).productData.status, "succeeded");
      assert.deepEqual(gitNative.requests[1]?.arguments, [
        "--no-optional-locks",
        "-c",
        "core.quotepath=false",
        "-c",
        "color.ui=false",
        "-c",
        "core.fsmonitor=false",
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
      ]);
      assert.equal(gitNative.requests[1]?.environment.GIT_OPTIONAL_LOCKS, "0");
      assert.equal(gitNative.requests[1]?.environment.GIT_TERMINAL_PROMPT, "0");
      assert.equal(gitNative.requests[1]?.environment.GIT_PAGER, "cat");
      assert.equal(gitNative.requests[1]?.environment.GIT_EDITOR, undefined);
      assert.equal(gitNative.requests[1]?.environment.GIT_ASKPASS, undefined);
      assert.equal(gitNative.requests[1]?.environment.EDEN_SECRET_NATIVE_CANARY, undefined);
    } finally {
      delete process.env.EDEN_SECRET_NATIVE_CANARY;
      delete process.env.GIT_EDITOR;
      delete process.env.GIT_ASKPASS;
    }
  });

  it("fails closed for missing, modified, incompatible, malformed, timed-out, and cancelled ripgrep", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-rg-failure-"));
    await writeFile(join(root, "fixture.txt"), "EDEN_NATIVE_MATCH\n");
    const asset = await pinnedRipgrep();
    const missing = await RepositoryToolService.open({ workspaceRoot: root });
    assert.equal((await missing.execute(searchCall())).productData.status, "failed");

    const modified = await RepositoryToolService.open({
      ripgrepAsset: { ...asset, contentHash: `sha256:${"0".repeat(64)}` },
      workspaceRoot: root,
    });
    const modifiedResult = await modified.execute(searchCall());
    assert.equal(modifiedResult.productData.status, "failed");
    if (modifiedResult.productData.status === "failed") {
      assert.equal(modifiedResult.productData.error.code, "ripgrep_asset_modified");
    }

    const cases: readonly {
      readonly code: string;
      readonly observations: readonly NativeProcessObservation[];
    }[] = [
      {
        code: "ripgrep_asset_incompatible",
        observations: [exited("ripgrep 14.1.0\n")],
      },
      {
        code: "native_output_invalid",
        observations: [exited("ripgrep 15.0.0\n"), exited("not-json\n")],
      },
      {
        code: "native_tool_timeout",
        observations: [exited("ripgrep 15.0.0\n"), { status: "timed-out" }],
      },
    ];
    for (const { code, observations } of cases) {
      const native = new ScriptedNativeProcess([...observations]);
      const service = await RepositoryToolService.open({
        nativeProcess: native,
        ripgrepAsset: asset,
        workspaceRoot: root,
      });
      const result = await service.execute(searchCall());
      assert.equal(result.productData.status, "failed");
      if (result.productData.status === "failed") assert.equal(result.productData.error.code, code);
    }

    const controller = new AbortController();
    controller.abort();
    const cancelled = await missing.execute(searchCall(), controller.signal);
    assert.equal(cancelled.productData.status, "failed");
    if (cancelled.productData.status === "failed") {
      assert.equal(cancelled.productData.error.code, "operation_aborted");
    }
  });

  it("reports distinct Git prerequisite and malformed-output recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-git-failure-"));
    await chmod(root, 0o755);
    for (const [observations, code] of [
      [[{ status: "spawn-failed" }], "git_unavailable"],
      [[exited("git version 2.30.9\n")], "git_incompatible"],
      [[exited("git version 2.43.0\n"), exited("? malformed")], "native_output_invalid"],
      [[exited("git version 2.43.0\n"), { status: "output-overflow" }], "native_output_overflow"],
    ] as const) {
      const native = new ScriptedNativeProcess([...observations] as NativeProcessObservation[]);
      const service = await RepositoryToolService.open({
        nativeProcess: native,
        workspaceRoot: root,
      });
      const result = await service.execute(gitCall);
      assert.equal(result.productData.status, "failed");
      if (result.productData.status === "failed") assert.equal(result.productData.error.code, code);
    }
  });

  it("projects ready and independently blocked prerequisite reviews", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-review-"));
    const ready = await RepositoryToolService.open({
      ripgrepAsset: await pinnedRipgrep(),
      workspaceRoot: root,
    });
    assert.equal((await ready.reviewCapabilities()).state, "ready");

    const blocked = await RepositoryToolService.open({
      gitExecutable: join(root, "missing-git"),
      workspaceRoot: root,
    });
    const review = await blocked.reviewCapabilities();
    assert.equal(review.state, "blocked");
    assert.equal(review.ripgrep.state, "blocked");
    assert.equal(review.git.state, "blocked");
    assert.equal(review.ripgrep.error?.code, "ripgrep_asset_missing");
    assert.equal(review.git.error?.code, "git_unavailable");
    assert.equal(JSON.stringify(review).includes(rgPath), false);
    assert.equal(decoder.decode(Buffer.from(JSON.stringify(review))).includes("stdout"), false);
  });

  it("probes independent ripgrep and Git prerequisites concurrently", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-native-review-concurrent-"));
    const asset = await pinnedRipgrep();
    let release: () => void = () => undefined;
    let bothStarted: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    let calls = 0;
    const nativeProcess: NativeProcessPort = {
      async run(request) {
        calls += 1;
        if (calls === 2) bothStarted();
        await gate;
        return request.executable === asset.path
          ? exited("ripgrep 15.0.0\n")
          : exited("git version 2.43.0\n");
      },
    };
    const service = await RepositoryToolService.open({
      nativeProcess,
      ripgrepAsset: asset,
      workspaceRoot: root,
    });
    const reviewing = service.reviewCapabilities();
    const concurrent = await Promise.race([started.then(() => true), delay(100).then(() => false)]);
    release();
    assert.equal((await reviewing).state, "ready");
    assert.equal(concurrent, true);
  });
});
