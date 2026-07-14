export type ComposerState = {
  readonly cursor: number;
  readonly text: string;
};

export type ComposerAction =
  | { readonly type: "backspace" }
  | { readonly type: "delete" }
  | { readonly type: "end" }
  | { readonly type: "home" }
  | { readonly type: "insert"; readonly text: string }
  | { readonly type: "left" };

const graphemeSegmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const splitGraphemes = (text: string) =>
  Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);

export const createComposerState = (text: string): ComposerState => ({ cursor: 0, text });

export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  const graphemes = splitGraphemes(state.text);

  switch (action.type) {
    case "backspace": {
      if (state.cursor === 0) {
        return state;
      }
      graphemes.splice(state.cursor - 1, 1);
      return { cursor: state.cursor - 1, text: graphemes.join("") };
    }
    case "delete": {
      if (state.cursor >= graphemes.length) {
        return state;
      }
      graphemes.splice(state.cursor, 1);
      return { cursor: state.cursor, text: graphemes.join("") };
    }
    case "end":
      return { ...state, cursor: graphemes.length };
    case "home":
      return { ...state, cursor: 0 };
    case "insert": {
      const inserted = splitGraphemes(action.text.replace(/\r\n?/gu, "\n"));
      graphemes.splice(state.cursor, 0, ...inserted);
      return {
        cursor: state.cursor + inserted.length,
        text: graphemes.join(""),
      };
    }
    case "left":
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
  }
}
