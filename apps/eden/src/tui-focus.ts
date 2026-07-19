export type TuiLayoutMode = "medium" | "narrow" | "wide";
export type TuiOverlay = "help" | "palette" | "profile" | "readiness" | null;
export type TuiRunState = "active" | "approval" | "none" | "retry" | "terminal";
export type TuiRunPane = "context" | "conversation" | "recovery";
export type TuiSurface = "history" | "inspection" | "workspace";
export type TuiWorkspaceState = "loading" | "restricted" | "trusted" | "updating";

export type TuiFocusId =
  | "history.back"
  | "history.list"
  | "inspection.back"
  | "overlay.help"
  | "overlay.palette"
  | "overlay.profile"
  | "overlay.readiness"
  | "run.approve"
  | "run.cancel"
  | "run.deny"
  | "run.exit"
  | "run.retry"
  | "run.tools"
  | "workspace.composer"
  | "workspace.connection"
  | "workspace.history"
  | "workspace.profile"
  | "workspace.repository"
  | "workspace.revoke"
  | "workspace.trust";

export type TuiCommandId =
  | "approve"
  | "back"
  | "cancel"
  | "connection"
  | "connection-confirm"
  | "composer"
  | "delete-profile"
  | "deny"
  | "exit"
  | "history"
  | "profile"
  | "reload-profiles"
  | "repository"
  | "retry"
  | "revoke"
  | "select-profile"
  | "show-context"
  | "show-conversation"
  | "show-recovery"
  | "toggle-tools"
  | "trust";

export type TuiFocusContext = {
  readonly hasProfile: boolean;
  readonly hasRepositoryReview: boolean;
  readonly hasTools: boolean;
  readonly overlay: TuiOverlay;
  readonly runState: TuiRunState;
  readonly surface: TuiSurface;
  readonly workspaceState: TuiWorkspaceState;
};

export type TuiKey = {
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly name: string;
  readonly option?: boolean;
  readonly shift?: boolean;
};

export type TuiKeyCommand =
  | { readonly type: "activate" }
  | { readonly type: "close-overlay" }
  | { readonly type: "focus-next" }
  | { readonly type: "focus-previous" }
  | { readonly type: "move-selection"; readonly direction: -1 | 1 }
  | { readonly type: "open-help" }
  | { readonly type: "open-palette" }
  | { readonly commandId: TuiCommandId; readonly type: "invoke" };

export type TuiPaletteEntry = {
  readonly commandId: TuiCommandId;
  readonly enabled: boolean;
  readonly label: string;
  readonly shortcut: string | null;
};

const focusCommands: Readonly<Partial<Record<TuiFocusId, TuiCommandId>>> = {
  "history.back": "back",
  "inspection.back": "back",
  "run.approve": "approve",
  "run.cancel": "cancel",
  "run.deny": "deny",
  "run.exit": "exit",
  "run.retry": "retry",
  "run.tools": "toggle-tools",
  "workspace.composer": "composer",
  "workspace.connection": "connection",
  "workspace.history": "history",
  "workspace.profile": "profile",
  "workspace.repository": "repository",
  "workspace.revoke": "revoke",
  "workspace.trust": "trust",
};

export function layoutModeForViewport(width: number, height: number): TuiLayoutMode {
  if (width <= 60 || height <= 20) return "narrow";
  if (width <= 80 || height <= 24) return "medium";
  return "wide";
}

export function focusOrder(context: TuiFocusContext): readonly TuiFocusId[] {
  if (context.overlay === "help") return ["overlay.help"];
  if (context.overlay === "palette") return ["overlay.palette"];
  if (context.overlay === "profile") return ["overlay.profile"];
  if (context.overlay === "readiness") return ["overlay.readiness"];
  if (context.surface === "inspection") return ["inspection.back"];
  if (context.surface === "history") return ["history.list", "history.back"];
  if (context.runState === "terminal") return ["run.exit"];
  if (context.runState === "approval") return ["run.approve", "run.deny", "run.cancel"];
  if (context.runState === "retry") return ["run.retry", "run.cancel"];
  if (context.runState === "active") {
    return context.hasTools ? ["run.tools", "run.cancel"] : ["run.cancel"];
  }
  if (context.workspaceState === "loading") return [];

  const order: TuiFocusId[] = [];
  if (context.workspaceState === "trusted") order.push("workspace.composer");
  else if (context.workspaceState === "restricted") order.push("workspace.trust");
  order.push("workspace.history", "workspace.profile");
  if (context.hasProfile) order.push("workspace.connection");
  if (context.hasRepositoryReview) order.push("workspace.repository");
  if (context.workspaceState === "trusted") order.push("workspace.revoke");
  return order;
}

export function reconcileFocus(
  context: TuiFocusContext,
  current: TuiFocusId | null,
): TuiFocusId | null {
  const order = focusOrder(context);
  if (current !== null && order.includes(current)) return current;
  return order[0] ?? null;
}

export function moveFocus(
  context: TuiFocusContext,
  current: TuiFocusId | null,
  direction: -1 | 1,
): TuiFocusId | null {
  const order = focusOrder(context);
  if (order.length === 0) return null;
  const currentIndex = current === null ? -1 : order.indexOf(current);
  if (currentIndex < 0) return direction === 1 ? (order[0] ?? null) : (order.at(-1) ?? null);
  return order[(currentIndex + direction + order.length) % order.length] ?? null;
}

export function commandForFocus(focus: TuiFocusId | null): TuiCommandId | null {
  return focus === null ? null : (focusCommands[focus] ?? null);
}

export function paletteEntries(context: TuiFocusContext): readonly TuiPaletteEntry[] {
  if (context.runState === "terminal") {
    return [{ commandId: "exit", enabled: true, label: "Exit Eden", shortcut: "q" }];
  }
  if (context.runState !== "none") {
    return [
      {
        commandId: "show-conversation",
        enabled: true,
        label: "Show conversation",
        shortcut: null,
      },
      {
        commandId: "show-context",
        enabled: true,
        label: "Show context and tool evidence",
        shortcut: null,
      },
      {
        commandId: "show-recovery",
        enabled: context.runState === "approval" || context.runState === "retry",
        label: "Show approval or recovery",
        shortcut: null,
      },
      {
        commandId: "approve",
        enabled: context.runState === "approval",
        label: "Approve displayed action",
        shortcut: "a",
      },
      {
        commandId: "deny",
        enabled: context.runState === "approval",
        label: "Deny displayed action",
        shortcut: "d",
      },
      {
        commandId: "retry",
        enabled: context.runState === "retry",
        label: "Retry from committed turn",
        shortcut: "u",
      },
      {
        commandId: "toggle-tools",
        enabled: context.hasTools,
        label: "Expand or fold tool evidence",
        shortcut: "e",
      },
      { commandId: "cancel", enabled: true, label: "Cancel run and exit", shortcut: "Ctrl+C" },
    ];
  }
  return [
    {
      commandId: "composer",
      enabled: context.workspaceState === "trusted",
      label: "Focus task composer",
      shortcut: "Enter",
    },
    { commandId: "history", enabled: true, label: "Open workspace history", shortcut: "h" },
    { commandId: "profile", enabled: true, label: "Edit provider profile", shortcut: "p" },
    {
      commandId: "connection",
      enabled: context.hasProfile,
      label: "Check provider connection (possible charge)",
      shortcut: "c",
    },
    {
      commandId: "repository",
      enabled: context.hasRepositoryReview,
      label: "Recheck repository prerequisites",
      shortcut: "g",
    },
    {
      commandId: "trust",
      enabled: context.workspaceState === "restricted",
      label: "Trust exact workspace",
      shortcut: "t",
    },
    {
      commandId: "revoke",
      enabled: context.workspaceState === "trusted",
      label: "Revoke workspace trust",
      shortcut: "r",
    },
    {
      commandId: "select-profile",
      enabled: context.hasProfile,
      label: "Select next provider profile",
      shortcut: "s",
    },
    {
      commandId: "delete-profile",
      enabled: context.hasProfile,
      label: "Delete provider profile",
      shortcut: "x",
    },
    {
      commandId: "reload-profiles",
      enabled: true,
      label: "Reload provider profiles",
      shortcut: "l",
    },
  ];
}

function invoke(commandId: TuiCommandId): TuiKeyCommand {
  return { commandId, type: "invoke" };
}

export function commandForKey(context: TuiFocusContext, key: TuiKey): TuiKeyCommand | null {
  if (key.ctrl && key.name === "p") return { type: "open-palette" };
  if (key.ctrl && key.name === "c") return invoke("cancel");
  if (context.overlay !== null) {
    if (context.overlay === "help" && (key.name === "?" || (key.name === "/" && key.shift))) {
      return { type: "close-overlay" };
    }
    if (context.overlay === "readiness") {
      if (key.name === "y") return invoke("connection-confirm");
      if (key.name === "n" || key.name === "escape") return { type: "close-overlay" };
      return null;
    }
    if (context.overlay === "profile") {
      return key.name === "escape" ? { type: "close-overlay" } : null;
    }
    if (key.name === "escape") return { type: "close-overlay" };
    if (key.name === "up") return { direction: -1, type: "move-selection" };
    if (key.name === "down") return { direction: 1, type: "move-selection" };
    if (key.name === "return") return { type: "activate" };
    return null;
  }
  if (key.meta || key.option) return null;
  if (key.name === "tab") {
    return { type: key.shift ? "focus-previous" : "focus-next" };
  }
  if (key.name === "return") return { type: "activate" };
  if (key.name === "escape") return invoke("back");
  if (key.name === "?" || (key.name === "/" && key.shift)) return { type: "open-help" };
  if (context.surface === "history") {
    if (key.name === "up") return { direction: -1, type: "move-selection" };
    if (key.name === "down") return { direction: 1, type: "move-selection" };
    if (key.name === "b") return invoke("back");
    return null;
  }
  if (context.surface === "inspection") return key.name === "b" ? invoke("back") : null;
  if (context.runState === "terminal") return key.name === "q" ? invoke("exit") : null;
  if (context.runState === "approval") {
    if (key.name === "a") return invoke("approve");
    if (key.name === "d") return invoke("deny");
  }
  if (context.runState === "retry" && key.name === "u") return invoke("retry");
  if (context.runState !== "none") return key.name === "e" ? invoke("toggle-tools") : null;
  if (key.name === "h") return invoke("history");
  if (key.name === "p") return invoke("profile");
  if (key.name === "s" && context.hasProfile) return invoke("select-profile");
  if (key.name === "x" && context.hasProfile) return invoke("delete-profile");
  if (key.name === "l") return invoke("reload-profiles");
  if (key.name === "g" && context.hasRepositoryReview) return invoke("repository");
  if (key.name === "c" && context.hasProfile) return invoke("connection");
  if (key.name === "t" && context.workspaceState === "restricted") return invoke("trust");
  if (key.name === "r") return invoke("revoke");
  return null;
}
