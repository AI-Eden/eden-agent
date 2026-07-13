import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { OpenTuiSpikeApp } from "./app.tsx";

const helpText = `Usage: terminal-spike-opentui [--help]

OpenTUI terminal-framework spike matching surface

Keys:
  a       Approve the selected action
  d       Deny the selected action
  q       Exit normally
  Ctrl+C  Cancel with exit code 130
`;

const unknownOption = process.argv.slice(2).find((option) => option !== "--help");

if (unknownOption !== undefined) {
  process.stderr.write(`Unknown option: ${unknownOption}\nRun with --help for usage.\n`);
  process.exitCode = 2;
} else if (process.argv.includes("--help")) {
  process.stdout.write(helpText);
} else {
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  const root = createRoot(renderer);
  root.render(
    <OpenTuiSpikeApp
      onExit={(result) => {
        process.exitCode = result === "normal:0" ? 0 : 130;
        root.unmount();
        renderer.destroy();
      }}
    />,
  );
}
