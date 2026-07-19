import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chmod, link, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ContextAdmissionError, ContextAdmissionService } from "@eden/coding-runtime";

const limits = { contextWindowTokens: 16_384, maxOutputTokens: 8_192 } as const;
const estimateTokens = (content: string) => Buffer.byteLength(content, "utf8");

async function workspace(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `eden-context-${label}-`));
}

function errorCode(code: string) {
  return (error: unknown) =>
    error instanceof ContextAdmissionError && error.productError.code === code;
}

describe("context admission", () => {
  it("loads complete root-to-leaf instructions with nested activation and sibling isolation", async () => {
    const root = await workspace("scope");
    await mkdir(join(root, "packages", "alpha", "src"), { recursive: true });
    await mkdir(join(root, "packages", "beta"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "root rules\n", "utf8");
    await writeFile(join(root, "packages", "alpha", "AGENTS.md"), "alpha rules\n", "utf8");
    await writeFile(join(root, "packages", "beta", "AGENTS.md"), "beta rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "unsupported rules\n", "utf8");
    await writeFile(join(root, "packages", "alpha", "src", "index.ts"), "export {};\n", "utf8");

    const service = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: root });
    const result = await service.prepare({
      items: [
        {
          content: "Answer the repository question.",
          contextItemId: "task-current",
          order: 0,
          priority: "P0",
          scopePath: ".",
          source: "current_task",
        },
      ],
      limits,
      targets: [
        {
          activatedContextItemIds: ["repository-alpha"],
          relativePath: "packages/alpha/src/index.ts",
        },
        {
          activatedContextItemIds: ["repository-alpha-repeat"],
          relativePath: "packages/alpha",
        },
      ],
    });

    assert.deepEqual(
      result.instructions.map((snapshot) => snapshot.sourcePath),
      ["AGENTS.md", "packages/alpha/AGENTS.md"],
    );
    assert.deepEqual(
      result.instructions.map((snapshot) => snapshot.content),
      ["root rules\n", "alpha rules\n"],
    );
    assert.deepEqual(
      result.instructions.map((snapshot) => snapshot.activatedContextItemIds),
      [
        ["repository-alpha", "repository-alpha-repeat"],
        ["repository-alpha", "repository-alpha-repeat"],
      ],
    );
    assert.deepEqual(
      result.instructions.map((snapshot) => snapshot.selectionReason),
      ["trusted_root", "path_scope"],
    );
    assert.equal(JSON.stringify(result).includes("beta rules"), false);
    assert.equal(JSON.stringify(result).includes("unsupported rules"), false);
    assert.deepEqual(
      result.instructions.map((snapshot) => snapshot.contentHash),
      ["root rules\n", "alpha rules\n"].map(
        (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`,
      ),
    );
    assert.equal(result.summary.state, "ready");
    assert.equal(result.summary.blocker, null);
  });

  it("selects P0 before ordered P1 and P2 and records deterministic omissions", async () => {
    const root = await workspace("priority");
    const service = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: root });
    const result = await service.prepare({
      items: [
        {
          content: "x".repeat(30),
          contextItemId: "p0",
          order: 0,
          priority: "P0",
          scopePath: ".",
          source: "task",
        },
        {
          content: "x".repeat(20),
          contextItemId: "p1-a",
          order: 1,
          priority: "P1",
          scopePath: ".",
          source: "turn",
        },
        {
          content: "x".repeat(10),
          contextItemId: "p1-b",
          order: 2,
          priority: "P1",
          scopePath: ".",
          source: "turn",
        },
        {
          content: "x",
          contextItemId: "p2",
          order: 3,
          priority: "P2",
          scopePath: ".",
          source: "evidence",
        },
      ],
      limits: { contextWindowTokens: 2_200, maxOutputTokens: 100 },
      targets: [],
    });

    assert.deepEqual(
      result.summary.items.map((item) => [item.contextItemId, item.selected, item.reason]),
      [
        ["p0", true, "required"],
        ["p1-a", true, "recent_context"],
        ["p1-b", false, "budget_omitted"],
        ["p2", true, "supporting_evidence"],
      ],
    );
    assert.equal(result.summary.budget?.selectedInputTokens, 51);
  });

  it("blocks oversized instructions, P0 overflow, root escape, and missing custom limits", async () => {
    const root = await workspace("blocked");
    await writeFile(join(root, "AGENTS.md"), "x".repeat(32 * 1024 + 1), "utf8");
    const service = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: root });
    let providerCalls = 0;
    await assert.rejects(async () => {
      const prepared = await service.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["oversized"], relativePath: "." }],
      });
      await service.dispatch(prepared, async () => {
        providerCalls += 1;
      });
    }, errorCode("instruction_file_too_large"));
    assert.equal(providerCalls, 0);
    await assert.rejects(
      service.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["escape"], relativePath: "../outside" }],
      }),
      errorCode("context_path_invalid"),
    );

    const emptyRoot = await workspace("p0");
    const empty = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: emptyRoot });
    await assert.rejects(
      empty.prepare({
        items: [
          {
            content: "x".repeat(53),
            contextItemId: "p0",
            order: 0,
            priority: "P0",
            scopePath: ".",
            source: "task",
          },
        ],
        limits: { contextWindowTokens: 2_200, maxOutputTokens: 100 },
        targets: [],
      }),
      (error) => {
        assert.equal(errorCode("context_p0_overflow")(error), true);
        if (!(error instanceof ContextAdmissionError)) return false;
        assert.equal(error.summary?.state, "blocked");
        assert.deepEqual(
          error.summary?.items.map((item) => [item.selected, item.selection, item.reason]),
          [[false, "omitted", "required_overflow"]],
        );
        return true;
      },
    );
    await assert.rejects(
      empty.prepare({ items: [], limits: null, targets: [] }),
      errorCode("context_profile_limits_required"),
    );
  });

  it("fails closed for unavailable, aggregate-oversized, and conflicting applicable instructions", async () => {
    const unavailableRoot = await workspace("unavailable");
    await mkdir(join(unavailableRoot, "AGENTS.md"));
    const unavailable = await ContextAdmissionService.open({
      estimateTokens,
      workspaceRoot: unavailableRoot,
    });
    await assert.rejects(
      unavailable.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["unavailable"], relativePath: "." }],
      }),
      errorCode("instruction_unavailable"),
    );

    const linkedRoot = await workspace("linked");
    const linkedSource = join(linkedRoot, "source.md");
    await writeFile(linkedSource, "linked rules\n", "utf8");
    await link(linkedSource, join(linkedRoot, "AGENTS.md"));
    const linked = await ContextAdmissionService.open({
      estimateTokens,
      workspaceRoot: linkedRoot,
    });
    await assert.rejects(
      linked.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["linked"], relativePath: "." }],
      }),
      errorCode("instruction_unavailable"),
    );

    const escapedRoot = await workspace("symlink-escape");
    const escapedOutside = await workspace("symlink-outside");
    await symlink(escapedOutside, join(escapedRoot, "outside"), "dir");
    const escaped = await ContextAdmissionService.open({
      estimateTokens,
      workspaceRoot: escapedRoot,
    });
    await assert.rejects(
      escaped.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["escaped"], relativePath: "outside" }],
      }),
      errorCode("context_path_invalid"),
    );

    if (process.platform !== "win32") {
      const unreadableRoot = await workspace("unreadable");
      const path = join(unreadableRoot, "AGENTS.md");
      await writeFile(path, "unreadable\n", "utf8");
      await chmod(path, 0);
      const unreadable = await ContextAdmissionService.open({
        estimateTokens,
        workspaceRoot: unreadableRoot,
      });
      try {
        await assert.rejects(
          unreadable.prepare({
            items: [],
            limits,
            targets: [{ activatedContextItemIds: ["unreadable"], relativePath: "." }],
          }),
          errorCode("instruction_unavailable"),
        );
      } finally {
        await chmod(path, 0o600);
      }
    }

    const chainRoot = await workspace("chain");
    let leaf = chainRoot;
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(leaf, "AGENTS.md"), `${index}${"x".repeat(30 * 1024 - 1)}`, "utf8");
      leaf = join(leaf, `level-${index}`);
      await mkdir(leaf);
    }
    const chain = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: chainRoot });
    await assert.rejects(
      chain.prepare({
        items: [],
        limits: { contextWindowTokens: 1_000_000, maxOutputTokens: 8_192 },
        targets: [
          {
            activatedContextItemIds: ["aggregate-chain"],
            relativePath: leaf.slice(chainRoot.length + 1),
          },
        ],
      }),
      errorCode("instruction_chain_too_large"),
    );

    const conflictRoot = await workspace("conflict");
    const conflictPath = join(conflictRoot, "AGENTS.md");
    await writeFile(conflictPath, "first\n", "utf8");
    const conflict = await ContextAdmissionService.open({
      estimateTokens,
      workspaceRoot: conflictRoot,
    });
    const secondTarget = { relativePath: "." } as {
      readonly activatedContextItemIds: readonly string[];
      readonly relativePath: string;
    };
    Object.defineProperty(secondTarget, "activatedContextItemIds", {
      get() {
        writeFileSync(conflictPath, "second\n", "utf8");
        return ["second"];
      },
    });
    await assert.rejects(
      conflict.prepare({
        items: [],
        limits,
        targets: [{ activatedContextItemIds: ["first"], relativePath: "." }, secondTarget],
      }),
      errorCode("instruction_changed"),
    );
  });

  it("detects changed instruction snapshots before provider dispatch", async () => {
    const root = await workspace("changed");
    await writeFile(join(root, "AGENTS.md"), "original\n", "utf8");
    const service = await ContextAdmissionService.open({ estimateTokens, workspaceRoot: root });
    const prepared = await service.prepare({
      items: [],
      limits,
      targets: [{ activatedContextItemIds: ["repository-root"], relativePath: "." }],
    });
    await writeFile(join(root, "AGENTS.md"), "changed\n", "utf8");

    let providerCalls = 0;
    await assert.rejects(
      service.dispatch(prepared, async () => {
        providerCalls += 1;
      }),
      errorCode("instruction_changed"),
    );
    assert.equal(providerCalls, 0);
  });
});
