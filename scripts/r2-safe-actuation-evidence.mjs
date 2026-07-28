const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const scenarioNames = [
  "approve",
  "deny-narrow",
  "stale",
  "pre-existing",
  "check-failure",
  "narrow-review",
];

export function validateSafeActuationEvidence(evidence) {
  if (
    evidence?.status !== "passed" ||
    !sourcePattern.test(evidence.sourceSha) ||
    evidence.execution?.isolation !== "none" ||
    evidence.execution?.mode !== "trusted_host_policy_only" ||
    evidence.execution?.network !== "not_requested" ||
    evidence.execution?.verifierSuccessClaimed !== false ||
    evidence.provider?.externalNetwork !== "not_requested" ||
    evidence.archive?.sourceTreeRequiredAtRuntime !== false
  ) {
    throw new Error("Safe-actuation evidence overstates or omits its execution authority.");
  }
  for (const field of [
    evidence.archive.applicationHash,
    evidence.archive.harnessHash,
    evidence.archive.noticesHash,
    evidence.archive.ripgrepHash,
  ]) {
    if (!hashPattern.test(field)) {
      throw new Error("Safe-actuation evidence contains a stale or malformed archive hash.");
    }
  }
  if (
    evidence.rows?.crashRecovery !== "covered-by-real-runtime-test-not-run-in-packaged-pty" ||
    evidence.rows?.docker !== "not-run" ||
    evidence.rows?.repositoryCodeChecks !== "not-run"
  ) {
    throw new Error("Safe-actuation evidence must retain explicit not-run rows.");
  }
  if (
    Object.keys(evidence.scenarios ?? {})
      .sort()
      .join("\0") !== [...scenarioNames].sort().join("\0")
  ) {
    throw new Error("Safe-actuation evidence is missing a required packaged scenario.");
  }
  for (const name of scenarioNames) {
    const scenario = evidence.scenarios[name];
    if (
      scenario?.status !== "passed" ||
      !hashPattern.test(scenario.fileSha256) ||
      !hashPattern.test(scenario.gitDiffSha256) ||
      !hashPattern.test(scenario.transcriptSha256) ||
      !/^[a-f0-9]{40,64}$/u.test(scenario.head) ||
      !scenario.approvalSurface?.base ||
      !scenario.approvalSurface?.digest ||
      !scenario.approvalSurface?.policy ||
      !scenario.approvalSurface?.lifetime ||
      !scenario.approvalSurface?.isolation ||
      !scenario.approvalSurface?.network ||
      !scenario.approvalSurface?.reason ||
      !scenario.approvalSurface?.scope
    ) {
      throw new Error(
        `Safe-actuation evidence scenario ${name} is incomplete: ${JSON.stringify(scenario?.approvalSurface ?? null)}.`,
      );
    }
    const blocked = name === "deny-narrow" || name === "stale";
    if (blocked) {
      if (scenario.outcome !== "blocked" || scenario.reviewHashes !== null) {
        throw new Error(`Safe-actuation blocker ${name} was rewritten as a review.`);
      }
      continue;
    }
    if (
      scenario.outcome !== "completed" ||
      scenario.reviewHashes?.eden?.state !== "complete" ||
      scenario.reviewHashes?.tracked?.state !== "complete" ||
      !hashPattern.test(scenario.reviewHashes.eden.contentHash) ||
      !hashPattern.test(scenario.reviewHashes.tracked.contentHash) ||
      !hashPattern.test(scenario.reviewHashes.status) ||
      scenario.reviewAuthority?.executionMode !== "trusted_host_policy_only" ||
      scenario.reviewAuthority?.isolation !== "none" ||
      scenario.reviewAuthority?.network !== "not_requested" ||
      scenario.reviewAuthority?.approval?.state !== "consumed" ||
      scenario.reviewAuthority?.policy?.decision !== "ask"
    ) {
      throw new Error(`Safe-actuation review ${name} is incomplete or overclaims success.`);
    }
  }
  return evidence;
}
