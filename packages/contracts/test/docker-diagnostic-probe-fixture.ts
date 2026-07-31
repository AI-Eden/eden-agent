const sha256 = (character: string) => `sha256:${character.repeat(64)}`;

export const dockerDiagnosticProbeActionFixture = {
  actionId: "action-docker-probe-1",
  actionVersion: 1,
  authority: {
    environmentClass: "closed_non_secret",
    executionMode: "docker_container",
    isolation: "linux_container",
    network: "none",
    policyVersion: 1,
    remediation: "none",
    ruleSetRevision: "r2-docker-diagnostic-probe-v1",
  },
  backend: {
    architecture: "amd64",
    clientApiVersion: "1.51",
    contextEndpointSha256: sha256("1"),
    contextName: "default",
    daemonApiVersion: "1.51",
    daemonIdentitySha256: sha256("2"),
    daemonMinimumApiVersion: "1.24",
    osType: "linux",
    serverVersion: "28.3.3",
  },
  budgets: {
    cpuPeriodMicros: 100_000,
    cpuQuotaMicros: 50_000,
    fileDescriptors: 64,
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    pids: 16,
    stderrBytes: 4_096,
    stdoutBytes: 4_096,
    stopGraceMs: 2_000,
    timeoutMs: 10_000,
    tmpfsBytes: 1_048_576,
  },
  kind: "docker_diagnostic_probe_v1",
  lifetime: { kind: "single_use_proposal_revision", revision: 1 },
  operation: {
    checks: [
      "process_user",
      "user_namespace",
      "capabilities",
      "no_new_privileges",
      "seccomp",
      "root_filesystem",
      "temporary_filesystem",
      "resource_limits",
      "result_protocol",
    ],
    probeProtocolVersion: 1,
    programId: "eden-docker-diagnostic-probe-v1",
    type: "docker_diagnostic_probe_v1",
  },
  probeId: "probe-example-1",
  profile: {
    autoRemove: false,
    capabilities: "drop_all",
    environment: {
      HOME: "/tmp",
      LANG: "C.UTF-8",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
    },
    entrypoint: "/nodejs/bin/node",
    hostNamespaces: "none",
    linuxUser: "65532:65532",
    network: "none",
    noNewPrivileges: true,
    privileged: false,
    profileRevision: "r2-docker-diagnostic-probe-v1",
    restart: "disabled",
    rootFilesystem: "read_only",
    seccomp: "docker_default",
    sockets: "none",
    temporaryFilesystem: {
      access: "read_write",
      containerPath: "/tmp",
      filesystem: "tmpfs",
      options: ["nodev", "noexec", "nosuid"],
    },
    workingDirectory: "/tmp",
  },
  proposalRevision: 1,
  scope: {
    capability: "docker.diagnostic.probe",
    paths: "none",
    repository: "none",
  },
  toolchain: {
    imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    nodeExecutable: "/nodejs/bin/node",
    nodeMajor: 24,
    platformManifestDigest:
      "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
    probeProgramBytes: 3_865,
    probeProgramSha256: "sha256:21a3f9fa698cc1ee547ecf503a64c3d9ced43d89d5fcc501620eb90f1060a19d",
    requestedPlatform: "linux/amd64",
    toolchainId: "eden-node24-check-v1",
  },
} as const;

export const dockerDiagnosticProbeActionDigestFixture =
  "c72190e0aebe5512362cf891954913bca226aa1d734a71bd0635998a99f92b03";

export const dockerDiagnosticProbePolicyFixture = {
  actionDigest: dockerDiagnosticProbeActionDigestFixture,
  decision: "ask",
  evaluatedAt: "2026-07-31T00:00:00.000Z",
  reason: "The exact Docker diagnostic probe requires one interactive approval.",
  ruleId: "r2.docker-diagnostic-probe.exact",
  ruleSetRevision: "r2-docker-diagnostic-probe-v1",
} as const;

export const dockerDiagnosticProbeApprovalCommandFixture = {
  actionDigest: dockerDiagnosticProbeActionDigestFixture,
  approvalId: "approval-probe-1",
  commandId: "command-probe-approval-1",
  decision: "approve",
  expectedRevision: 1,
  probeId: "probe-example-1",
  protocolVersion: 1,
  type: "docker.probe.approval.resolve",
} as const;

export const dockerDiagnosticProbeApprovalRequiredFixture = {
  action: dockerDiagnosticProbeActionFixture,
  actionDigest: dockerDiagnosticProbeActionDigestFixture,
  approval: {
    approvalId: "approval-probe-1",
    choices: ["approve", "deny"],
    expectedRevision: 1,
  },
  eventId: "event-probe-approval-1",
  limitations: [
    "The probe does not inspect or execute repository code.",
    "Approval is single-use for this exact action digest.",
  ],
  nextActions: ["Approve or deny this exact diagnostic probe."],
  policy: dockerDiagnosticProbePolicyFixture,
  probeId: "probe-example-1",
  protocolVersion: 1,
  revision: 1,
  type: "docker.probe.approval.required",
} as const;

export const dockerDiagnosticProbeRecoveryResolvedFixture = {
  actionDigest: dockerDiagnosticProbeActionDigestFixture,
  actionId: "action-docker-probe-1",
  effectId: "effect-docker-probe-1",
  eventId: "event-probe-recovery-resolved-1",
  lastLifecycleState: "action_prepared",
  limitations: [
    "No Docker inspection or mutation occurred.",
    "No execution receipt or cleanup claim was created.",
  ],
  nextAction: "The interactive invocation may propose a new exact diagnostic action.",
  outcome: "not_started",
  probeId: "probe-example-1",
  protocolVersion: 1,
  reason: "approval_not_consumed",
  resolvedAt: "2026-07-31T00:00:01.000Z",
  revision: 1,
  type: "docker.probe.recovery.resolved",
} as const;

const labels = {
  actionId: "action-docker-probe-1",
  configDigest: sha256("4"),
  effectId: "effect-docker-probe-1",
  imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
  platformManifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
  probeId: "probe-example-1",
  profileRevision: "r2-docker-diagnostic-probe-v1",
  schema: "eden.docker-diagnostic-probe.v1",
} as const;

export const dockerDiagnosticProbeReceiptFixture = {
  actionId: "action-docker-probe-1",
  configDigest: sha256("4"),
  container: {
    id: "5".repeat(64),
    name: "eden-probe-0123456789abcdef01234567",
  },
  effectId: "effect-docker-probe-1",
  labels,
  lifecycleState: "exited",
  probeId: "probe-example-1",
  receiptId: "receipt-docker-probe-1",
  receiptVersion: 1,
  recordedAt: "2026-07-31T00:00:03.000Z",
  resultDigest: sha256("6"),
  resultOutcome: "passed",
} as const;

export const dockerDiagnosticProbeCleanupFixture = {
  actionId: "action-docker-probe-1",
  cleanupVersion: 1,
  completedAt: "2026-07-31T00:00:04.000Z",
  container: {
    id: "5".repeat(64),
    name: "eden-probe-0123456789abcdef01234567",
    state: "removed",
  },
  effectId: "effect-docker-probe-1",
  error: null,
  probeId: "probe-example-1",
  receiptId: "receipt-docker-probe-1",
  status: "complete",
} as const;

export const dockerDiagnosticProbeObservationsFixture = [
  { check: "process_user", gid: 65_532, status: "passed", uid: 65_532 },
  { check: "user_namespace", mapping: "remapped", status: "passed" },
  { check: "capabilities", effectiveMask: "0000000000000000", status: "passed" },
  { check: "no_new_privileges", enabled: true, status: "passed" },
  { check: "seccomp", mode: "filter", status: "passed" },
  { access: "read_only", check: "root_filesystem", status: "passed" },
  {
    check: "temporary_filesystem",
    filesystem: "tmpfs",
    nodev: true,
    noexec: true,
    nosuid: true,
    sizeBytes: 1_048_576,
    status: "passed",
    writable: true,
  },
  {
    check: "resource_limits",
    cpuPeriodMicros: 100_000,
    cpuQuotaMicros: 50_000,
    fileDescriptors: 64,
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    pids: 16,
    status: "passed",
  },
  {
    byteLength: 512,
    check: "result_protocol",
    protocolVersion: 1,
    sha256: sha256("6"),
    status: "passed",
  },
] as const;

export const dockerDiagnosticProbeResultFixture = {
  actionId: "action-docker-probe-1",
  cleanup: dockerDiagnosticProbeCleanupFixture,
  effectId: "effect-docker-probe-1",
  endedAt: "2026-07-31T00:00:03.000Z",
  observations: dockerDiagnosticProbeObservationsFixture,
  outcome: "passed",
  probeId: "probe-example-1",
  receipt: dockerDiagnosticProbeReceiptFixture,
  resultVersion: 1,
  startedAt: "2026-07-31T00:00:02.000Z",
} as const;

export const dockerDiagnosticProbeProductViewFixture = {
  action: dockerDiagnosticProbeActionFixture,
  actionDigest: dockerDiagnosticProbeActionDigestFixture,
  approval: null,
  cleanup: dockerDiagnosticProbeCleanupFixture,
  effectId: "effect-docker-probe-1",
  lifecycle: [
    { observedAt: "2026-07-31T00:00:00.000Z", state: "awaiting_approval" },
    { observedAt: "2026-07-31T00:00:01.000Z", state: "approval_consumed" },
    { observedAt: "2026-07-31T00:00:01.100Z", state: "effect_intent" },
    { observedAt: "2026-07-31T00:00:01.500Z", state: "container_created" },
    { observedAt: "2026-07-31T00:00:02.000Z", state: "dispatch_started" },
    { observedAt: "2026-07-31T00:00:03.000Z", state: "receipt_recorded" },
    { observedAt: "2026-07-31T00:00:04.000Z", state: "cleanup_recorded" },
    { observedAt: "2026-07-31T00:00:04.100Z", state: "terminal" },
  ],
  limitations: [
    "The probe does not inspect or execute repository code.",
    "The result describes one bounded container, not the Docker daemon or host.",
  ],
  nextActions: ["Review the closed diagnostic observations."],
  policy: dockerDiagnosticProbePolicyFixture,
  probeId: "probe-example-1",
  projectionVersion: 1,
  receipt: dockerDiagnosticProbeReceiptFixture,
  result: dockerDiagnosticProbeResultFixture,
  revision: 1,
  state: "terminal",
} as const;

export const dockerDiagnosticProbeTerminalEventFixture = {
  eventId: "event-probe-terminal-1",
  probe: dockerDiagnosticProbeProductViewFixture,
  probeId: "probe-example-1",
  protocolVersion: 1,
  revision: 1,
  type: "docker.probe.terminal",
} as const;
