import { expect, test } from "bun:test";

import type { DockerDoctorReportV1, RepositoryCheckProductViewV1 } from "@eden/contracts";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { DockerDoctorCard, RepositoryCheckCard } from "../src/repository-check-cards.tsx";

const sha256 = (character: string) => `sha256:${character.repeat(64)}`;

const repositoryCheck = {
  actionId: "action-repository-check-1",
  checkName: "test",
  effectId: "effect-repository-check-1",
  input: {
    catalogSha256: sha256("1"),
    imageIndexDigest: sha256("2"),
    manifestDigest: sha256("3"),
    platformManifestDigest: sha256("4"),
    profileRevision: "r2-docker-profile-v1",
  },
  isolation: {
    network: "none",
    rootFilesystem: "read_only",
    workspaceMount: "read_only",
  },
  lifecycle: [{ observedAt: "2026-07-30T03:00:00.000Z", state: "awaiting_approval" }],
  limitations: ["Repository output is local-only and untrusted."],
  nextActions: ["Approve or deny this exact named check."],
  process: {
    arguments: ["--test"],
    cwd: ".",
    executable: "/usr/local/bin/node",
  },
  projectionVersion: 1,
  receipt: null,
  result: null,
  runId: "run-repository-check-1",
  state: "awaiting_approval",
} satisfies RepositoryCheckProductViewV1;

const doctor = {
  doctorVersion: 1,
  mode: "read_only",
  mutation: "none",
  observedAt: "2026-07-30T03:01:00.000Z",
  rows: [
    {
      details: [
        { name: "apiVersion", value: "1.51" },
        { name: "linuxContainers", value: "true" },
      ],
      id: "docker.backend",
      status: "ready",
      summary: "Linux-container backend is reachable.",
    },
    {
      details: [
        { name: "pullPolicy", value: "never" },
        { name: "present", value: "false" },
      ],
      id: "docker.image",
      status: "blocked",
      summary: "The exact local Eden toolchain image is absent.",
    },
  ],
} satisfies DockerDoctorReportV1;

test("repository-check approval and lifecycle card keeps exact authority visible", async () => {
  for (const width of [60, 80, 100]) {
    const renderer = await testRender(
      <RepositoryCheckCard repositoryCheck={repositoryCheck} width={width} />,
      { height: 24, width },
    );
    try {
      await act(async () => renderer.flush());
      const frame = renderer.captureCharFrame();
      expect(frame).toContain("named check: test");
      expect(frame).toContain("/usr/local/bin/node --test");
      expect(frame).toContain("cwd: .");
      expect(frame).toContain("network none");
      expect(frame).toContain("workspace read_only");
      expect(frame).toContain("awaiting_approval");
      expect(frame).not.toContain("docker run");
    } finally {
      act(() => renderer.renderer.destroy());
    }
  }
});

test("doctor card renders the same closed read-only rows without remediation", async () => {
  const renderer = await testRender(<DockerDoctorCard doctor={doctor} width={80} />, {
    height: 24,
    width: 80,
  });
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("doctor: read_only");
    expect(frame).toContain("mutation: none");
    expect(frame).toContain("docker.backend · ready");
    expect(frame).toContain("docker.image · blocked");
    expect(frame).toContain("pullPolicy=never");
    expect(frame).not.toContain("docker pull");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});
