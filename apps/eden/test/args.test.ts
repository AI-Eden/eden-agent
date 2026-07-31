import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { parseArgs } from "../src/args.ts";

test("headless arguments preserve separate workspace trust and action approval", async () => {
  const argv = [
    "exec",
    "--json",
    "--trust-workspace",
    "--approve-fake-action",
    "Index the fake workspace",
  ];

  const result = await parseArgs(argv);

  deepStrictEqual(result, {
    ok: true,
    value: {
      approveFakeAction: true,
      mode: "headless",
      task: "Index the fake workspace",
      trustWorkspace: true,
    },
  });
});

test("unknown and empty arguments fail with stable product errors", async () => {
  const unknown = await parseArgs(["exec", "--json", "--wat", "task"]);
  const empty = await parseArgs(["exec", "--json", ""]);
  const duplicateTrust = await parseArgs([
    "exec",
    "--json",
    "--trust-workspace",
    "--trust-workspace",
    "task",
  ]);

  strictEqual(unknown.ok, false);
  strictEqual(empty.ok, false);
  strictEqual(duplicateTrust.ok, false);
  if (!unknown.ok) strictEqual(unknown.error.code, "invalid_arguments");
  if (!empty.ok) strictEqual(empty.error.code, "invalid_arguments");
});

test("run list and show require exact JSON-only grammar", async () => {
  deepStrictEqual(await parseArgs(["run", "list", "--json"]), {
    ok: true,
    value: { mode: "run-list" },
  });
  deepStrictEqual(await parseArgs(["run", "show", "--json", "run-1"]), {
    ok: true,
    value: { mode: "run-show", runId: "run-1" },
  });

  const invalid = [
    ["run", "list"],
    ["run", "list", "--json", "extra"],
    ["run", "show", "run-1"],
    ["run", "show", "--json"],
    ["run", "show", "--json", "../run-1"],
    ["run", "show", "--json", "run-1", "extra"],
    ["run", "show", "--json", "--json", "run-1"],
  ];
  for (const argv of invalid) strictEqual((await parseArgs(argv)).ok, false);
});

test("profile list and check require exact JSON-only grammar", async () => {
  deepStrictEqual(await parseArgs(["profile", "list", "--json"]), {
    ok: true,
    value: { mode: "profile-list" },
  });
  deepStrictEqual(await parseArgs(["profile", "check", "--json"]), {
    ok: true,
    value: { mode: "profile-check" },
  });
  strictEqual((await parseArgs(["profile", "list"])).ok, false);
});

test("doctor accepts only the frozen read-only and explicit probe grammar", async () => {
  deepStrictEqual(await parseArgs(["doctor"]), {
    ok: true,
    value: { format: "plain", mode: "doctor" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--json"]), {
    ok: true,
    value: { format: "json", mode: "doctor" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker"]), {
    ok: true,
    value: { format: "plain", mode: "doctor-probe" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker", "--json"]), {
    ok: true,
    value: { format: "json", mode: "doctor-probe" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker", "--context", "eden-fresh-userns"]), {
    ok: true,
    value: {
      dockerContext: "eden-fresh-userns",
      format: "plain",
      mode: "doctor-probe",
    },
  });
  deepStrictEqual(
    await parseArgs(["doctor", "--probe-docker", "--context", "desktop-linux", "--json"]),
    {
      ok: true,
      value: { dockerContext: "desktop-linux", format: "json", mode: "doctor-probe" },
    },
  );

  for (const argv of [
    ["doctor", "--json", "--json"],
    ["doctor", "--json", "--probe-docker"],
    ["doctor", "--probe-docker", "--probe-docker"],
    ["doctor", "--probe-docker", "--json", "--json"],
    ["doctor", "--probe-docker", "--yes"],
    ["doctor", "--context", "default"],
    ["doctor", "--probe-docker", "--context"],
    ["doctor", "--probe-docker", "--context", ""],
    ["doctor", "--probe-docker", "--context", "unix:///tmp/docker.sock"],
    ["doctor", "--probe-docker", "--context", "../daemon"],
    ["doctor", "--probe-docker", "--context", "a".repeat(129)],
    ["doctor", "--probe-docker", "--context", "default", "--context", "other"],
    ["doctor", "--probe-docker", "--json", "--context", "default"],
    ["doctor", "--probe-docker", "--host", "unix:///tmp/docker.sock"],
    ["doctor", "--yes"],
    ["doctor", "repair"],
  ]) {
    strictEqual((await parseArgs(argv)).ok, false);
  }
});
