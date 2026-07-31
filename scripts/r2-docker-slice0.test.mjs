import { deepStrictEqual, doesNotMatch, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { helpText, parseArgs } from "../apps/eden/src/args.ts";
import { decodeActionEnvelope, decodeRepositoryToolCall } from "../packages/contracts/src/index.ts";
import {
  createDockerSlice0Fixtures,
  measureDockerSlice0Fixtures,
  r2DockerContractBudgets,
} from "./r2-docker-contract-budgets.mjs";

test("Docker repository-check fixtures fit the frozen journal budgets", () => {
  const sizes = measureDockerSlice0Fixtures();
  const recordHeadroom = Math.floor(
    r2DockerContractBudgets.journalRecordBytes * r2DockerContractBudgets.actionRecordFillRatio,
  );

  deepStrictEqual(sizes, {
    actionRecord: 31_897,
    argumentBytes: 3_926,
    catalog: 4_133,
    manifest: 23_734,
    resultRecord: 45_348,
    run: 84_971,
  });
  strictEqual(sizes.argumentBytes <= r2DockerContractBudgets.argumentBytes, true);
  strictEqual(sizes.catalog <= r2DockerContractBudgets.catalogBytes, true);
  strictEqual(sizes.manifest <= r2DockerContractBudgets.manifestBytes, true);
  strictEqual(sizes.actionRecord < recordHeadroom, true);
  strictEqual(sizes.resultRecord < recordHeadroom, true);
  strictEqual(sizes.run < r2DockerContractBudgets.journalRunBytes, true);
});

test("current decoders accept only the implemented closed Docker authority shape", () => {
  const { action } = createDockerSlice0Fixtures();
  strictEqual(decodeActionEnvelope(action).ok, true);
  strictEqual(
    decodeRepositoryToolCall({
      arguments: { checkName: "test" },
      name: "repository_check",
      toolCallId: "tool-r2-docker",
    }).ok,
    true,
  );
  strictEqual(decodeActionEnvelope({ ...action, dockerCompatibility: undefined }).ok, false);
  strictEqual(
    decodeActionEnvelope({
      ...action,
      dockerCompatibility: {
        ...action.dockerCompatibility,
        features: { ...action.dockerCompatibility.features, userNamespace: false },
      },
    }).ok,
    false,
  );
  strictEqual(
    decodeRepositoryToolCall({
      arguments: { checkName: "test", executable: "/usr/local/bin/node" },
      name: "repository_check",
      toolCallId: "tool-r2-docker",
    }).ok,
    false,
  );
});

test("current CLI exposes accepted explicit probe preview without a repository-check approval bypass", async () => {
  strictEqual((await parseArgs(["doctor"])).ok, true);
  strictEqual((await parseArgs(["doctor", "--json"])).ok, true);
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker"]), {
    ok: true,
    value: { format: "plain", mode: "doctor-probe" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker", "--json"]), {
    ok: true,
    value: { format: "json", mode: "doctor-probe" },
  });
  strictEqual(
    (await parseArgs(["exec", "--json", "--approve-repository-check", "task"])).ok,
    false,
  );
  strictEqual(/\bdoctor\b/u.test(helpText), true);
  strictEqual(/doctor --probe-docker/u.test(helpText), true);
  doesNotMatch(helpText, /approve-repository-check/u);
});

test("Slice 0 evidence preserves exact package identity and not-run authority rows", () => {
  const evidence = JSON.parse(
    readFileSync(
      new URL(
        "../docs/benchmark-results/2026-07-30-r2-docker-slice0-linux-x64.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  strictEqual(evidence.status, "passed");
  strictEqual(evidence.sourceSha, "a99718f3d091fe90e031e90b6259fb0e5bdf4b49");
  deepStrictEqual(evidence.contractBudgets, {
    actionRecordBytes: 29_931,
    argumentBytes: 3_926,
    catalogBytes: 4_133,
    estimatedRunBytes: 82_622,
    journalRecordLimitBytes: 65_536,
    journalRunLimitBytes: 1_048_576,
    manifestBytes: 23_734,
    resultRecordBytes: 44_965,
  });
  deepStrictEqual(evidence.contractAmendment, {
    approvedAt: "2026-07-30",
    baseImage: {
      imageIndexDigest: "sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212",
      linuxAmd64ManifestDigest:
        "sha256:b1386d556b478c420927eb212236bfb31be9834a4549850a060a6351f7fff514",
      linuxArm64ManifestDigest:
        "sha256:c6465a8fcd268010c53e6e33e58d479dd232aa34f2312500afad8f605caffdc3",
      reference: "gcr.io/distroless/nodejs24-debian13:nonroot",
    },
    executableAlias: "/usr/local/bin/node -> /nodejs/bin/node",
    registryMetadataRead: "performed-anonymous-read-only",
    streamEncoding: "canonical-base64-of-raw-bytes",
    streamLengthAndHash: "decoded-raw-bytes",
  });
  deepStrictEqual(evidence.authority, {
    commit: "not-run",
    dockerExecution: "not-run",
    externalNetwork: "not-requested",
    imagePublication: "not-run",
    provider: "not-requested",
    push: "not-run",
    repositoryCodeChecks: "not-run",
  });
});
