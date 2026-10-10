import type { ArmMetrics } from "./metrics";

function percent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function interval(value: readonly [number, number] | null): string {
  return value === null ? "" : ` (${percent(value[0])} to ${percent(value[1])})`;
}

function money(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(2)}`;
}

export function metricsTable(options: {
  readonly title: string;
  readonly metrics: readonly ArmMetrics[];
}): string {
  const rows = options.metrics.map(
    (entry) =>
      `| ${entry.arm} | ${entry.completed} of ${entry.reviews} | ${entry.defectsFound} of ${entry.defectChances} (${percent(entry.recall)})${interval(entry.recallInterval)} | ${entry.findings} | ${percent(entry.realShare)}${interval(entry.realInterval)} | ${percent(entry.wrongRate)} | ${entry.disputed} | ${entry.findingsPerCleanReview?.toFixed(2) ?? "n/a"} | ${entry.medianSeconds ?? "n/a"} s | ${money(entry.meanCostUsd)} |`,
  );

  return [
    `### ${options.title}`,
    "",
    "| Reviewer | Reviews done | Known defects found | Findings | Real | Wrong | Disputed | Findings per clean review | Median time | Mean cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
}
