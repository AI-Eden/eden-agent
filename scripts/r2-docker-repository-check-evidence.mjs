const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const containerIdPattern = /^[a-f0-9]{64}$/u;
const scenarioOutcomes = Object.freeze({
  "correct-pass": "passed",
  "initial-fail": "failed",
  "wrong-fail": "failed",
});
const requiredRows = Object.freeze([
  "approval",
  "catalog",
  "cleanup",
  "containment",
  "fixture",
  "image",
  "journal",
  "providerBoundary",
  "recovery",
  "result",
  "snapshot",
  "trust",
]);
const lifecycle = Object.freeze([
  "awaiting_approval",
  "preparing",
  "creating",
  "created",
  "running",
  "exited",
  "result_decoded",
  "cleaning",
  "review",
]);
const image = Object.freeze({
  indexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
  linuxAmd64ManifestDigest:
    "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
  linuxArm64ManifestDigest:
    "sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230",
});

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")
  ) {
    throw new Error(`Repository-check evidence ${label} is not closed.`);
  }
}

function hash(value, label) {
  if (!sha256Pattern.test(value)) {
    throw new Error(`Repository-check evidence ${label} has no exact SHA-256 identity.`);
  }
}

function validateScenario(name, scenario) {
  exactKeys(
    scenario,
    [
      "actionDigest",
      "approvalConsumed",
      "catalogSha256",
      "cleanup",
      "containerId",
      "dockerObjectsAfter",
      "duplicateExecutions",
      "edit",
      "fixtureHead",
      "independentOracle",
      "journalSha256",
      "lifecycle",
      "localRawOutputVisible",
      "manifestDigest",
      "modelCalls",
      "providerCalls",
      "rawOutputWithheld",
      "receiptBeforeCleanup",
      "resultOutcome",
      "secretCanaryAbsent",
      "status",
      "terminalOutcome",
      "transcriptSha256",
    ],
    `scenario ${name}`,
  );
  exactKeys(
    scenario.independentOracle,
    ["exitCode", "outcome", "stderrSha256", "stdoutSha256"],
    `scenario ${name} independent oracle`,
  );
  exactKeys(
    scenario.edit,
    name === "initial-fail"
      ? ["performed"]
      : ["afterSha256", "beforeSha256", "performed", "reviewOutcome"],
    `scenario ${name} edit`,
  );
  if (
    scenario.status !== "passed" ||
    scenario.resultOutcome !== scenarioOutcomes[name] ||
    scenario.terminalOutcome !== "completed" ||
    scenario.approvalConsumed !== true ||
    scenario.receiptBeforeCleanup !== true ||
    scenario.cleanup !== "complete" ||
    scenario.dockerObjectsAfter !== 0 ||
    scenario.duplicateExecutions !== 0 ||
    scenario.providerCalls !== 0 ||
    !Number.isInteger(scenario.modelCalls) ||
    scenario.modelCalls < 1 ||
    scenario.rawOutputWithheld !== true ||
    scenario.localRawOutputVisible !== true ||
    scenario.secretCanaryAbsent !== true ||
    !containerIdPattern.test(scenario.containerId) ||
    !sourcePattern.test(scenario.fixtureHead) ||
    scenario.lifecycle.join("\0") !== lifecycle.join("\0")
  ) {
    throw new Error(
      `Repository-check evidence scenario ${name} is incomplete or overclaims success: ${JSON.stringify(scenario)}.`,
    );
  }
  for (const [label, value] of [
    ["action digest", `sha256:${scenario.actionDigest}`],
    ["catalog", scenario.catalogSha256],
    ["journal", scenario.journalSha256],
    ["manifest", scenario.manifestDigest],
    ["transcript", scenario.transcriptSha256],
    ["oracle stdout", scenario.independentOracle.stdoutSha256],
    ["oracle stderr", scenario.independentOracle.stderrSha256],
  ]) {
    hash(value, `${name} ${label}`);
  }
  if (
    scenario.independentOracle.outcome !== scenarioOutcomes[name] ||
    (scenarioOutcomes[name] === "passed"
      ? scenario.independentOracle.exitCode !== 0
      : scenario.independentOracle.exitCode === 0)
  ) {
    throw new Error(
      `Repository-check evidence scenario ${name} disagrees with its independent oracle.`,
    );
  }
  const editExpected = name !== "initial-fail";
  if (
    scenario.edit.performed !== editExpected ||
    (editExpected &&
      (scenario.edit.reviewOutcome !== "completed" ||
        !sha256Pattern.test(scenario.edit.beforeSha256) ||
        !sha256Pattern.test(scenario.edit.afterSha256) ||
        scenario.edit.beforeSha256 === scenario.edit.afterSha256))
  ) {
    throw new Error(`Repository-check evidence scenario ${name} has invalid edit lineage.`);
  }
}

export function validateDockerRepositoryCheckEvidence(evidence, expectedSourceSha) {
  exactKeys(
    evidence,
    [
      "archive",
      "authority",
      "backend",
      "evidenceVersion",
      "fixture",
      "rows",
      "scenarios",
      "sourceSha",
      "status",
      "toolchain",
    ],
    "root",
  );
  exactKeys(
    evidence.archive,
    ["applicationHash", "harnessHash", "noticesHash", "ripgrepHash", "sourceTreeRequiredAtRuntime"],
    "archive",
  );
  exactKeys(
    evidence.authority,
    [
      "credential",
      "credentialValueCaptured",
      "externalNetwork",
      "provider",
      "verifierSuccessClaimed",
    ],
    "authority",
  );
  exactKeys(
    evidence.backend,
    [
      "architecture",
      "cgroupNamespace",
      "clientApiVersion",
      "clientVersion",
      "contextEndpointSha256",
      "contextName",
      "daemonApiVersion",
      "daemonVersion",
      "osType",
      "seccomp",
      "userNamespace",
    ],
    "backend",
  );
  exactKeys(
    evidence.fixture,
    ["dependencyInstall", "network", "secretCanaryTracked", "sourceTreeSha256"],
    "fixture",
  );
  exactKeys(
    evidence.toolchain,
    ["indexDigest", "platformManifestDigest", "pullPolicy"],
    "toolchain",
  );
  if (
    evidence.evidenceVersion !== 1 ||
    evidence.status !== "passed" ||
    !sourcePattern.test(expectedSourceSha) ||
    evidence.sourceSha !== expectedSourceSha ||
    evidence.authority.provider !== "deterministic-local-fixture" ||
    evidence.authority.externalNetwork !== "not_requested" ||
    evidence.authority.credential !== "non-secret-fixture-only" ||
    evidence.authority.credentialValueCaptured !== false ||
    evidence.authority.verifierSuccessClaimed !== false ||
    evidence.backend.osType !== "linux" ||
    (evidence.backend.architecture !== "amd64" && evidence.backend.architecture !== "arm64") ||
    !/^\d+(?:\.\d+)+$/u.test(evidence.backend.clientVersion) ||
    !/^\d+(?:\.\d+)+$/u.test(evidence.backend.daemonVersion) ||
    !/^1\.\d+$/u.test(evidence.backend.clientApiVersion) ||
    !/^1\.\d+$/u.test(evidence.backend.daemonApiVersion) ||
    evidence.backend.userNamespace !== true ||
    evidence.backend.seccomp !== true ||
    evidence.backend.cgroupNamespace !== true ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(evidence.backend.contextName)
  ) {
    throw new Error("Repository-check evidence has unsupported authority or backend truth.");
  }
  if (
    evidence.toolchain.indexDigest !== image.indexDigest ||
    evidence.toolchain.platformManifestDigest !==
      (evidence.backend.architecture === "amd64"
        ? image.linuxAmd64ManifestDigest
        : image.linuxArm64ManifestDigest) ||
    evidence.toolchain.pullPolicy !== "never"
  ) {
    throw new Error("Repository-check evidence has stale image or platform identity.");
  }
  for (const [label, value] of [
    ["archive application", evidence.archive.applicationHash],
    ["archive harness", evidence.archive.harnessHash],
    ["archive notices", evidence.archive.noticesHash],
    ["archive ripgrep", evidence.archive.ripgrepHash],
    ["fixture tree", evidence.fixture.sourceTreeSha256],
    ["context endpoint", evidence.backend.contextEndpointSha256],
  ]) {
    hash(value, label);
  }
  if (
    evidence.archive.sourceTreeRequiredAtRuntime !== false ||
    evidence.fixture.dependencyInstall !== "not-run" ||
    evidence.fixture.network !== "none" ||
    evidence.fixture.secretCanaryTracked !== false
  ) {
    throw new Error("Repository-check evidence has a mutable fixture or archive dependency.");
  }
  exactKeys(evidence.rows, requiredRows, "rows");
  if (requiredRows.some((row) => evidence.rows[row] !== "passed")) {
    throw new Error("Repository-check evidence is missing a required passing row.");
  }
  exactKeys(evidence.scenarios, Object.keys(scenarioOutcomes), "scenarios");
  const manifests = new Set(
    Object.values(evidence.scenarios).map((scenario) => scenario.manifestDigest),
  );
  if (manifests.size !== 3) {
    throw new Error("Repository-check evidence must bind three distinct immutable snapshots.");
  }
  for (const name of Object.keys(scenarioOutcomes)) {
    validateScenario(name, evidence.scenarios[name]);
  }
  return evidence;
}

export const dockerRepositoryCheckEvidenceConstants = Object.freeze({
  image,
  lifecycle,
  requiredRows,
});
