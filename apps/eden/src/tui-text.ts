const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function singleLine(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
  }).join("");
}

export function safeTerminalBlock(value: string): string {
  return Array.from(value, (character) => {
    if (character === "\n") return character;
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
  }).join("");
}

function graphemeWidth(value: string): number {
  return value.length === 1 && value.charCodeAt(0) <= 0x7f ? 1 : 2;
}

export function terminalTextWidth(value: string): number {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(singleLine(value))) {
    width += graphemeWidth(segment);
  }
  return width;
}

export function fitTerminalLine(value: string, maxColumns: number): string {
  if (maxColumns <= 0) return "";
  const normalized = singleLine(value);
  if (terminalTextWidth(normalized) <= maxColumns) return normalized;
  if (maxColumns <= 3) return ".".repeat(maxColumns);
  const target = maxColumns - 3;
  let width = 0;
  let fitted = "";
  for (const { segment } of graphemeSegmenter.segment(normalized)) {
    const nextWidth = width + graphemeWidth(segment);
    if (nextWidth > target) break;
    fitted += segment;
    width = nextWidth;
  }
  return `${fitted}...`;
}
