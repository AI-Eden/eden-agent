export function terminalScreenText(transcript, columns, rows) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));
  let row = 0;
  let column = 0;
  let savedRow = 0;
  let savedColumn = 0;
  const clear = () => {
    for (const line of cells) line.fill(" ");
    row = 0;
    column = 0;
  };
  for (let index = 0; index < transcript.length; ) {
    const character = transcript[index];
    if (character === "\u001B") {
      if (transcript[index + 1] === "]") {
        const bell = transcript.indexOf("\u0007", index + 2);
        const terminator = transcript.indexOf("\u001B\\", index + 2);
        const end =
          bell === -1 ? terminator : terminator === -1 ? bell : Math.min(bell, terminator);
        index = end === -1 ? transcript.length : end + (end === terminator ? 2 : 1);
        continue;
      }
      if (["P", "X", "^", "_"].includes(transcript[index + 1] ?? "")) {
        const terminator = transcript.indexOf("\u001B\\", index + 2);
        index = terminator === -1 ? transcript.length : terminator + 2;
        continue;
      }
      const match = /^([0-9;?]*)([ -/]*)?([@-~])/u.exec(transcript.slice(index + 2));
      if (match !== null) {
        const final = match[3];
        const parameters = match[1]
          .replace(/^\?/u, "")
          .split(";")
          .map((value) => (value === "" ? 0 : Number.parseInt(value, 10)));
        const first = parameters[0] ?? 0;
        if ((final === "H" || final === "f") && !match[1].startsWith("?")) {
          row = Math.max(0, Math.min(rows - 1, (parameters[0] || 1) - 1));
          column = Math.max(0, Math.min(columns - 1, (parameters[1] || 1) - 1));
        } else if (final === "A") row = Math.max(0, row - (first || 1));
        else if (final === "B") row = Math.min(rows - 1, row + (first || 1));
        else if (final === "C") column = Math.min(columns - 1, column + (first || 1));
        else if (final === "D") column = Math.max(0, column - (first || 1));
        else if (final === "G") column = Math.max(0, Math.min(columns - 1, (first || 1) - 1));
        else if (final === "d") row = Math.max(0, Math.min(rows - 1, (first || 1) - 1));
        else if (final === "J" && (first === 2 || first === 3)) clear();
        else if (final === "K")
          cells[row]?.fill(" ", first === 1 ? 0 : column, first === 1 ? column + 1 : undefined);
        else if (final === "X")
          cells[row]?.fill(" ", column, Math.min(columns, column + (first || 1)));
        else if (final === "s" && !match[1].startsWith("?")) {
          savedRow = row;
          savedColumn = column;
        } else if (final === "u" && !match[1].startsWith("?")) {
          row = savedRow;
          column = savedColumn;
        }
        index += match[0].length + 2;
        continue;
      }
      index += 2;
      continue;
    }
    if (character === "\r") column = 0;
    else if (character === "\n") {
      row = Math.min(rows - 1, row + 1);
      column = 0;
    } else if (character === "\b") column = Math.max(0, column - 1);
    else if (character !== undefined && character >= " ") {
      cells[row][column] = character;
      column += 1;
      if (column >= columns) {
        column = 0;
        row = Math.min(rows - 1, row + 1);
      }
    }
    index += 1;
  }
  return cells.map((line) => line.join("").trimEnd()).join("\n");
}
