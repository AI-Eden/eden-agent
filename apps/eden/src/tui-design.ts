import type { TuiLayoutMode } from "./tui-focus.ts";

export const tuiDesignTokens = {
  border: {
    card: true,
    panel: true,
    surface: false,
  },
  color: {
    accent: "#8BD5CA",
    awaiting: "#EED49F",
    danger: "#ED8796",
    disabled: "#777777",
    muted: "#8A8A8A",
  },
  focus: {
    active: ">",
    idle: " ",
  },
  spacing: {
    none: 0,
    panel: 1,
    section: 1,
  },
  state: {
    awaiting: "awaiting",
    disabled: "disabled",
    ready: "ready",
  },
} as const;

export function densityForLayout(layoutMode: TuiLayoutMode): {
  readonly border: boolean;
  readonly gap: 0 | 1;
  readonly padding: 0 | 1;
} {
  return layoutMode === "narrow"
    ? { border: false, gap: 0, padding: 0 }
    : { border: true, gap: 1, padding: 1 };
}
