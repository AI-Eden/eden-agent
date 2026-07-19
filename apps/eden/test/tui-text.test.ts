import { expect, test } from "bun:test";

import { fitTerminalLine, safeTerminalBlock, terminalTextWidth } from "../src/tui-text.ts";

test("single-line fitting neutralizes terminal control characters before measuring", () => {
  const fitted = fitTerminalLine(
    "root\nnext\tcolumn\rreturn\u0000nul\u007fdel\u0080c1-low\u009fc1-high",
    80,
  );

  expect(fitted).toBe("root next column return nul del c1-low c1-high");
  expect(
    Array.from(fitted).every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    }),
  ).toBe(true);
  expect(terminalTextWidth("a\nb")).toBe(3);
});

test("multi-line tool content preserves answers without emitting terminal controls", () => {
  expect(safeTerminalBlock("first\nsecond\u001b[31m\tred\r\n")).toBe("first\nsecond [31m red \n");
});
