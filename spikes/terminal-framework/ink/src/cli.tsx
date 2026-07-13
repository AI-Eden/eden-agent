import { render } from "ink";
import { InkSpikeApp } from "./app.tsx";

const argument = process.argv.slice(2).find((value) => value !== "--");

if (argument === "--help") {
  process.stdout.write("Usage: terminal-spike-ink\n\nKeys: a approve, d deny, q exit\n");
} else if (argument !== undefined) {
  process.stderr.write(`Unknown argument: ${argument}\n`);
  process.exitCode = 2;
} else {
  let terminal: ReturnType<typeof render> | undefined;
  terminal = render(
    <InkSpikeApp
      onExit={(result) => {
        process.exitCode = result === "normal:0" ? 0 : 130;
        terminal?.unmount();
      }}
    />,
    { exitOnCtrlC: false },
  );
}
