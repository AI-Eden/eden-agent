import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeMeasurements } from "../src/measurement-statistics.ts";

describe("measurement statistics", () => {
  it("reports median and nearest-rank p95 from successful observations", () => {
    // Given thirty deliberately unsorted successful measurements.
    const values = [
      30, 1, 29, 2, 28, 3, 27, 4, 26, 5, 25, 6, 24, 7, 23, 8, 22, 9, 21, 10, 20, 11, 19, 12, 18, 13,
      17, 14, 16, 15,
    ];

    // When the common summary is calculated.
    const summary = summarizeMeasurements(values, 2);

    // Then failures remain explicit and do not become zero-latency samples.
    assert.deepEqual(summary, {
      failureCount: 2,
      median: 15.5,
      p95: 29,
      successCount: 30,
    });
  });

  it("preserves an empty successful distribution", () => {
    // Given every recorded trial failed before producing a measurement.
    // When the common summary is calculated.
    const summary = summarizeMeasurements([], 3);

    // Then the record keeps null statistics and the complete failure count.
    assert.deepEqual(summary, {
      failureCount: 3,
      median: null,
      p95: null,
      successCount: 0,
    });
  });
});
