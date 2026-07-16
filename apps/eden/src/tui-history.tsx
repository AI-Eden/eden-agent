import { AgentClientError } from "@eden/coding-runtime";
import type { AgentClient, ProductError, RunCatalog, RunInspection } from "@eden/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { fitTerminalLine } from "./tui-text.ts";

export type RunHistoryControllerOptions = {
  readonly client: AgentClient;
  readonly onCatalogChange?: ((catalog: RunCatalog) => void) | undefined;
  readonly onInspectionChange?: ((inspection: RunInspection) => void) | undefined;
  readonly onOpen: () => void;
};

function historyUnavailable(): ProductError {
  return {
    code: "run_history_unavailable",
    message: "Run history is unavailable.",
    recoverability: "reconfigure",
    suggestedActions: ["Refresh this workspace's run history and choose another run."],
  };
}

function productError(cause: unknown): ProductError {
  return cause instanceof AgentClientError ? cause.productError : historyUnavailable();
}

export function useRunHistory({
  client,
  onCatalogChange,
  onInspectionChange,
  onOpen,
}: RunHistoryControllerOptions) {
  const [catalog, setCatalog] = useState<RunCatalog | null>(null);
  const [error, setError] = useState<ProductError | null>(null);
  const [inspection, setInspection] = useState<RunInspection | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [surface, setSurface] = useState<"history" | "inspection" | "workspace">("workspace");
  const catalogController = useRef<AbortController | null>(null);
  const catalogGeneration = useRef(0);
  const inspectionController = useRef<AbortController | null>(null);
  const inspectionGeneration = useRef(0);

  const invalidateCatalog = useCallback(() => {
    catalogGeneration.current += 1;
    catalogController.current?.abort();
    catalogController.current = null;
  }, []);

  const invalidateInspection = useCallback(() => {
    inspectionGeneration.current += 1;
    inspectionController.current?.abort();
    inspectionController.current = null;
  }, []);

  useEffect(
    () => () => {
      invalidateCatalog();
      invalidateInspection();
    },
    [invalidateCatalog, invalidateInspection],
  );

  const loadCatalog = useCallback(async () => {
    invalidateCatalog();
    invalidateInspection();
    const controller = new AbortController();
    catalogController.current = controller;
    const generation = catalogGeneration.current;
    setInspection(null);
    setError(null);
    try {
      const nextCatalog = await client.getRunCatalog({ signal: controller.signal });
      if (generation !== catalogGeneration.current || controller.signal.aborted) return;
      setCatalog(nextCatalog);
      setSelectedIndex((current) => Math.min(current, Math.max(0, nextCatalog.entries.length - 1)));
      setError(null);
      onCatalogChange?.(nextCatalog);
    } catch (cause) {
      if (generation !== catalogGeneration.current || controller.signal.aborted) return;
      setError(productError(cause));
    } finally {
      if (catalogController.current === controller) catalogController.current = null;
    }
  }, [client, invalidateCatalog, invalidateInspection, onCatalogChange]);

  const openHistory = useCallback(() => {
    onOpen();
    setSurface("history");
    void loadCatalog();
  }, [loadCatalog, onOpen]);

  const openInspection = useCallback(async () => {
    const entry = catalog?.entries[selectedIndex];
    if (entry === undefined) return;
    invalidateCatalog();
    invalidateInspection();
    setInspection(null);
    if (entry.availability === "unavailable") {
      setError(entry.error);
      return;
    }
    const controller = new AbortController();
    inspectionController.current = controller;
    const generation = inspectionGeneration.current;
    setError(null);
    try {
      const nextInspection = await client.inspectRun(entry.runId, { signal: controller.signal });
      if (generation !== inspectionGeneration.current || controller.signal.aborted) return;
      setInspection(nextInspection);
      setSurface("inspection");
      setError(null);
      onInspectionChange?.(nextInspection);
    } catch (cause) {
      if (generation !== inspectionGeneration.current || controller.signal.aborted) return;
      setError(productError(cause));
    } finally {
      if (inspectionController.current === controller) inspectionController.current = null;
    }
  }, [catalog, client, invalidateCatalog, invalidateInspection, onInspectionChange, selectedIndex]);

  const back = useCallback(() => {
    invalidateCatalog();
    invalidateInspection();
    setError(null);
    setInspection(null);
    setSurface("workspace");
  }, [invalidateCatalog, invalidateInspection]);

  const moveSelection = useCallback(
    (offset: -1 | 1) => {
      invalidateInspection();
      setInspection(null);
      setSelectedIndex((current) =>
        Math.max(0, Math.min(Math.max(0, (catalog?.entries.length ?? 1) - 1), current + offset)),
      );
      setError(null);
    },
    [catalog, invalidateInspection],
  );

  return {
    back,
    catalog,
    error,
    inspection,
    loadCatalog,
    moveSelection,
    openHistory,
    openInspection,
    selectedIndex,
    surface,
  } as const;
}

export type HistoryPanelProps = {
  readonly catalog: RunCatalog | null;
  readonly compact: boolean;
  readonly error: ProductError | null;
  readonly height: number;
  readonly selectedIndex: number;
  readonly width: number;
};

function summaryStatus(entry: RunCatalog["entries"][number]): string {
  if (entry.availability === "unavailable") return "unavailable";
  return entry.terminalOutcome?.state ?? entry.phase;
}

function rowLabel(entry: RunCatalog["entries"][number], compact: boolean, width: number): string {
  const maxColumns = Math.max(1, width - 6);
  if (entry.availability === "unavailable") {
    return fitTerminalLine(`${entry.runId} · unavailable`, maxColumns);
  }
  const suffix = compact
    ? ` · ${summaryStatus(entry)}`
    : ` · ${summaryStatus(entry)} · ${entry.updatedAt}`;
  return fitTerminalLine(`${entry.task}${suffix}`, maxColumns);
}

export function HistoryPanel({
  catalog,
  compact,
  error,
  height,
  selectedIndex,
  width,
}: HistoryPanelProps) {
  const entries = catalog?.entries ?? [];
  const auxiliaryRows =
    (catalog !== null && catalog.notices.length > 0 ? 1 : 0) +
    (catalog?.truncated === true ? 1 : 0) +
    (error === null ? 0 : 2);
  const visibleCount = Math.max(1, height - (compact ? 12 : 14) - auxiliaryRows);
  const firstIndex = Math.min(
    Math.max(0, selectedIndex - visibleCount + 1),
    Math.max(0, entries.length - visibleCount),
  );
  const visibleEntries = entries.slice(firstIndex, firstIndex + visibleCount);
  const lastIndex = firstIndex + visibleEntries.length;
  return (
    <box style={{ flexDirection: "column", marginTop: 1 }}>
      <text>Current-workspace history · read-only</text>
      {catalog === null && <text>Loading run history…</text>}
      {catalog !== null && catalog.entries.length === 0 && <text>No runs in this workspace.</text>}
      {entries.length > visibleEntries.length && (
        <text>
          Showing {firstIndex + 1}-{lastIndex} of {entries.length}
        </text>
      )}
      {visibleEntries.map((entry, offset) => (
        <text key={entry.runId}>
          {firstIndex + offset === selectedIndex ? ">" : " "} {rowLabel(entry, compact, width)}
        </text>
      ))}
      {catalog !== null && catalog.notices.length > 0 && (
        <text fg="#ED8796">
          {fitTerminalLine(`notice: ${catalog.notices[0]?.message ?? ""}`, width - 4)}
        </text>
      )}
      {catalog?.truncated === true && <text>History is truncated to the R1 catalog limit.</text>}
      {error !== null && (
        <box style={{ flexDirection: "column" }}>
          <text fg="#ED8796">{fitTerminalLine(`${error.code}: ${error.message}`, width - 4)}</text>
          <text>{fitTerminalLine(`recovery: ${error.suggestedActions[0] ?? ""}`, width - 4)}</text>
        </box>
      )}
      <text>
        {compact
          ? "Up/Down selects · Enter opens · b back · ^C exits"
          : "Up/Down selects · Enter inspects · b returns · Ctrl+C exits"}
      </text>
    </box>
  );
}

export function InspectionPanel({
  compact,
  inspection,
  width,
}: {
  readonly compact: boolean;
  readonly inspection: RunInspection;
  readonly width: number;
}) {
  const outcome = inspection.view.terminalOutcome;
  const check = inspection.view.checks[0];
  return (
    <box style={{ flexDirection: "column", marginTop: 1 }}>
      <text fg="#8BD5CA">read-only history</text>
      {!compact && (
        <text>{fitTerminalLine(`workspace: ${inspection.view.workspace.root}`, width - 4)}</text>
      )}
      <text>{fitTerminalLine(`run: ${inspection.summary.runId}`, width - 4)}</text>
      <text>{fitTerminalLine(`task: ${inspection.summary.task}`, width - 4)}</text>
      <text>phase: {inspection.view.phase}</text>
      <text>outcome: {outcome?.state ?? "not terminal"}</text>
      {inspection.view.approval !== null && (
        <box style={{ flexDirection: "column" }}>
          <text>approval: recorded evidence</text>
          {!compact && (
            <text>
              {fitTerminalLine(`action: ${inspection.view.approval.canonicalDisplay}`, width - 4)}
            </text>
          )}
          <text>continued execution is unavailable in R1</text>
        </box>
      )}
      {check !== undefined && <text>check: {check.status}</text>}
      {outcome?.state === "succeeded" && (
        <text>{fitTerminalLine(`evidence: ${outcome.evidenceRef}`, width - 4)}</text>
      )}
      {check?.evidenceRef !== undefined && (
        <text>{fitTerminalLine(`check evidence: ${check.evidenceRef}`, width - 4)}</text>
      )}
      {!compact && inspection.view.residualRisk !== null && (
        <text>{fitTerminalLine(`residual risk: ${inspection.view.residualRisk}`, width - 4)}</text>
      )}
      <text>b returns · Ctrl+C exits</text>
    </box>
  );
}
