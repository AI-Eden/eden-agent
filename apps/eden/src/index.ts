#!/usr/bin/env node

const command = process.argv[2];

if (command === "exec") {
  process.stdout.write(
    `${JSON.stringify({
      kind: "scaffold",
      message: "The headless runtime is not implemented yet.",
      roadmapStage: "R0",
    })}\n`,
  );
} else {
  process.stdout.write(
    [
      "eden-agent — R0 architecture scaffold",
      "",
      "The interactive terminal product is not implemented yet.",
      "Read docs/plans/README.md for the first delivery slice.",
      "",
    ].join("\n"),
  );
}
