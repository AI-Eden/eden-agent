import { Box, type DOMElement, Text, useBoxMetrics, useCursor } from "ink";
import { useRef } from "react";
import { type ComposerState, splitComposerAtCursor } from "./composer-state.ts";

type InkComposerProps = {
  readonly state: ComposerState;
};

const label = "composer: ";
const indentation = " ".repeat(label.length);

export function InkComposer({ state }: InkComposerProps) {
  const composerRef = useRef<DOMElement | null>(null);
  const cursorLineRef = useRef<DOMElement | null>(null);
  const cursorAnchorRef = useRef<DOMElement | null>(null);
  const composerMetrics = useBoxMetrics(composerRef);
  const cursorLineMetrics = useBoxMetrics(cursorLineRef);
  const cursorAnchorMetrics = useBoxMetrics(cursorAnchorRef);
  const { setCursorPosition } = useCursor();
  const cursorParts = splitComposerAtCursor(state);
  const beforeLines = cursorParts.before.split("\n");
  const afterLines = cursorParts.after.split("\n");
  const cursorBefore = beforeLines.at(-1) ?? "";
  const cursorAfter = afterLines[0] ?? "";
  const leadingLines = beforeLines.slice(0, -1);
  const trailingLines = afterLines.slice(1);
  const renderedLeading = leadingLines
    .map((line, index) => `${index === 0 ? label : indentation}${line}`)
    .join("\n");
  const renderedTrailing = trailingLines.map((line) => `${indentation}${line}`).join("\n");

  if (
    composerMetrics.hasMeasured &&
    cursorLineMetrics.hasMeasured &&
    cursorAnchorMetrics.hasMeasured
  ) {
    setCursorPosition({
      x: composerMetrics.left + cursorLineMetrics.left + cursorAnchorMetrics.left,
      y: composerMetrics.top + cursorLineMetrics.top + cursorAnchorMetrics.top,
    });
  } else {
    setCursorPosition(undefined);
  }

  return (
    <Box ref={composerRef} flexDirection="column">
      {renderedLeading.length > 0 && <Text>{renderedLeading}</Text>}
      <Box ref={cursorLineRef} flexDirection="row">
        <Text>
          {leadingLines.length === 0 ? label : indentation}
          {cursorBefore}
        </Text>
        <Box ref={cursorAnchorRef} flexShrink={0} height={1} width={0} />
        <Text>{cursorAfter}</Text>
      </Box>
      {renderedTrailing.length > 0 && <Text>{renderedTrailing}</Text>}
    </Box>
  );
}
