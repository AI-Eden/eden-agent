import { strictEqual } from "node:assert";
import { test } from "node:test";

import { terminalScreenText } from "./terminal-screen.mjs";

test("terminal screen reconstruction retains the current redraw rather than transcript debris", () => {
  strictEqual(terminalScreenText("old\u001B[1;1Hnew\u001B[K", 8, 2), "new\n");
});
