import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, test } from "node:test";

import { decodeRepositoryCheckCatalog } from "../src/repository-check.ts";

const acceptedCatalog = {
  checks: [
    {
      name: "test",
      process: {
        arguments: ["--test", "test/failing.test.js"],
        cwd: ".",
        executable: "/usr/local/bin/node",
      },
    },
  ],
  version: 1,
} as const;

describe("repository-check catalog contract", () => {
  test("accepts one exact version-one literal named process", () => {
    deepStrictEqual(decodeRepositoryCheckCatalog(acceptedCatalog), {
      ok: true,
      value: acceptedCatalog,
    });
  });

  test("rejects shell, interpolation, parameters, and authority-bearing fields", () => {
    for (const invalid of [
      { ...acceptedCatalog, shell: "node --test" },
      {
        ...acceptedCatalog,
        checks: [
          {
            ...acceptedCatalog.checks[0],
            process: { ...acceptedCatalog.checks[0].process, shell: true },
          },
        ],
      },
      {
        ...acceptedCatalog,
        checks: [
          {
            ...acceptedCatalog.checks[0],
            process: {
              ...acceptedCatalog.checks[0].process,
              arguments: ["--test", "$" + "{USER_TEST}"],
              interpolation: true,
            },
          },
        ],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], parameters: ["path"] }],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], environment: { TOKEN: "secret" } }],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], image: "node:24" }],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], network: "default" }],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], approval: "allow" }],
      },
    ]) {
      strictEqual(decodeRepositoryCheckCatalog(invalid).ok, false);
    }
  });

  test("rejects duplicate or malformed names and widened catalog structure", () => {
    for (const invalid of [
      { ...acceptedCatalog, version: 2 },
      { ...acceptedCatalog, checks: [] },
      {
        ...acceptedCatalog,
        checks: Array.from({ length: 17 }, (_, index) => ({
          ...acceptedCatalog.checks[0],
          name: `test-${index}`,
        })),
      },
      {
        ...acceptedCatalog,
        checks: [acceptedCatalog.checks[0], acceptedCatalog.checks[0]],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], name: "Test" }],
      },
      {
        ...acceptedCatalog,
        checks: [{ ...acceptedCatalog.checks[0], name: `t${"x".repeat(64)}` }],
      },
      { ...acceptedCatalog, includes: ["other.json"] },
    ]) {
      strictEqual(decodeRepositoryCheckCatalog(invalid).ok, false);
    }
  });

  test("rejects process values outside the frozen literal grammar and budgets", () => {
    const process = acceptedCatalog.checks[0].process;
    for (const invalidProcess of [
      { ...process, executable: "node" },
      { ...process, executable: "/usr/local/bin/" },
      { ...process, executable: `/${"x".repeat(256)}` },
      { ...process, executable: "/usr/local/bin/no\u0000de" },
      { ...process, arguments: Array.from({ length: 33 }, () => "x") },
      { ...process, arguments: [`${"x".repeat(257)}`] },
      { ...process, arguments: ["has\u0000nul"] },
      { ...process, arguments: Array.from({ length: 17 }, () => "x".repeat(256)) },
      { ...process, cwd: "/workspace" },
      { ...process, cwd: "../outside" },
      { ...process, cwd: "src\\windows" },
      { ...process, cwd: `src/${"x".repeat(256)}` },
    ]) {
      strictEqual(
        decodeRepositoryCheckCatalog({
          ...acceptedCatalog,
          checks: [{ ...acceptedCatalog.checks[0], process: invalidProcess }],
        }).ok,
        false,
      );
    }
  });
});
