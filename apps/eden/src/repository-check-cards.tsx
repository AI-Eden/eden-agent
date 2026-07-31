import type { DockerDoctorReportV1, RepositoryCheckProductViewV1 } from "@eden/contracts";

import { tuiDesignTokens } from "./tui-design.ts";
import { fitTerminalLine, safeTerminalBlock } from "./tui-text.ts";

function digestSummary(value: string): string {
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function displayBase64Stream(value: string): string {
  return new TextDecoder().decode(Buffer.from(value, "base64"));
}

export function RepositoryCheckCard({
  repositoryCheck,
  width,
}: {
  readonly repositoryCheck: RepositoryCheckProductViewV1;
  readonly width: number;
}) {
  const process = [repositoryCheck.process.executable, ...repositoryCheck.process.arguments].join(
    " ",
  );
  const result = repositoryCheck.result;
  return (
    <box
      style={{
        border: tuiDesignTokens.border.card,
        flexDirection: "column",
        padding: tuiDesignTokens.spacing.panel,
        width: "100%",
      }}
    >
      <text fg={tuiDesignTokens.color.awaiting}>
        named check: {repositoryCheck.checkName} · {repositoryCheck.state}
      </text>
      <text>{fitTerminalLine(`process: ${process}`, width - 4)}</text>
      <text>cwd: {repositoryCheck.process.cwd}</text>
      <text>
        isolation: network {repositoryCheck.isolation.network} · workspace{" "}
        {repositoryCheck.isolation.workspaceMount} · root {repositoryCheck.isolation.rootFilesystem}
      </text>
      <text>
        input: catalog {digestSummary(repositoryCheck.input.catalogSha256)} · snapshot{" "}
        {digestSummary(repositoryCheck.input.manifestDigest)}
      </text>
      <text>
        image: {digestSummary(repositoryCheck.input.imageIndexDigest)} · platform{" "}
        {digestSummary(repositoryCheck.input.platformManifestDigest)}
      </text>
      <text>lifecycle: {repositoryCheck.lifecycle.map((entry) => entry.state).join(" → ")}</text>
      {result === null ? (
        <text>{repositoryCheck.nextActions[0]}</text>
      ) : (
        <>
          <text>
            result: {result.outcome} · exit {result.exitCode ?? "unknown"} · cleanup{" "}
            {result.cleanup.status}
          </text>
          <text>
            stdout: {result.stdoutByteLength} bytes · {digestSummary(result.stdoutSha256)}
          </text>
          <text>{safeTerminalBlock(displayBase64Stream(result.stdout))}</text>
          <text>
            stderr: {result.stderrByteLength} bytes · {digestSummary(result.stderrSha256)}
          </text>
          <text>{safeTerminalBlock(displayBase64Stream(result.stderr))}</text>
          <text>review outcome remains completed; a passed check is not generic succeeded.</text>
        </>
      )}
      {repositoryCheck.limitations.map((limitation) => (
        <text fg={tuiDesignTokens.color.muted} key={limitation}>
          limitation: {fitTerminalLine(limitation, width - 4)}
        </text>
      ))}
    </box>
  );
}

export function DockerDoctorCard({
  doctor,
  width,
}: {
  readonly doctor: DockerDoctorReportV1;
  readonly width: number;
}) {
  return (
    <box
      style={{
        border: tuiDesignTokens.border.card,
        flexDirection: "column",
        padding: tuiDesignTokens.spacing.panel,
        width: "100%",
      }}
    >
      <text>
        doctor: {doctor.mode} · mutation: {doctor.mutation}
      </text>
      {doctor.rows.map((row) => (
        <box key={row.id} style={{ flexDirection: "column", width: "100%" }}>
          <text>
            {row.id} · {row.status}
          </text>
          <text>{fitTerminalLine(row.summary, width - 4)}</text>
          <text>
            {fitTerminalLine(
              row.details.map((detail) => `${detail.name}=${detail.value}`).join(" · "),
              width - 4,
            )}
          </text>
        </box>
      ))}
    </box>
  );
}
