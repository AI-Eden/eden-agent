export type MeasurementSummary = {
  readonly failureCount: number;
  readonly median: number | null;
  readonly p95: number | null;
  readonly successCount: number;
};

export function summarizeMeasurements(
  values: readonly number[],
  failureCount: number,
): MeasurementSummary {
  if (values.length === 0) {
    return { failureCount, median: null, p95: null, successCount: 0 };
  }

  const sorted = values.toSorted((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const lower = sorted[midpoint - 1];
  const upper = sorted[midpoint];
  if (upper === undefined) {
    throw new RangeError("A non-empty measurement distribution must have an upper midpoint");
  }
  const median = sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper;
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  const p95 = sorted[p95Index];
  if (p95 === undefined) {
    throw new RangeError("A non-empty measurement distribution must have a p95 value");
  }
  return { failureCount, median, p95, successCount: values.length };
}
