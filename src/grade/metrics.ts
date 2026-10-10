import type { ArmName, ArmRun } from "../arms";
import type { ReviewCase } from "../cases/schema";
import { runSeconds } from "./collect";
import type { JudgedCase } from "./judge";
import { agreedDetections, bootstrapInterval, finalLabels } from "./labels";

export type ArmMetrics = {
  readonly arm: ArmName;
  readonly reviews: number;
  readonly completed: number;
  readonly findings: number;
  readonly real: number;
  readonly minor: number;
  readonly wrong: number;
  readonly disputed: number;
  readonly realShare: number | null;
  readonly realInterval: readonly [number, number] | null;
  readonly wrongRate: number | null;
  readonly defectsFound: number;
  readonly defectChances: number;
  readonly recall: number | null;
  readonly recallInterval: readonly [number, number] | null;
  readonly findingsPerCleanReview: number | null;
  readonly medianSeconds: number | null;
  readonly meanCostUsd: number | null;
};

function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted.length === 0 ? null : (sorted[Math.floor((sorted.length - 1) / 2)] ?? null);
}

function caseTotals(options: {
  readonly arm: ArmName;
  readonly entry: ReviewCase;
  readonly judged: JudgedCase | undefined;
  readonly runs: readonly ArmRun[];
  readonly tiebreaks: ReadonlyMap<string, string>;
}) {
  const done = options.runs.filter((run) => run.status === "done");
  const mine = (options.judged?.findings ?? []).filter((finding) => finding.arm === options.arm);
  const labels = finalLabels({
    findingIds: mine.map((finding) => finding.id),
    answers: options.judged?.answers ?? [],
    tiebreaks: options.tiebreaks,
  });
  const detections = agreedDetections(options.judged?.answers ?? []);
  const count = (label: string) =>
    mine.filter((finding) => labels.get(finding.id) === label).length;
  const found = done.reduce((total, run) => {
    const defects = new Set(
      mine
        .filter((finding) => finding.repeat === run.repeat)
        .flatMap((finding) => [...(detections.get(finding.id) ?? [])]),
    );

    return total + defects.size;
  }, 0);

  return {
    clean: options.entry.defects.length === 0,
    completed: done.length,
    findings: mine.length,
    real: count("real"),
    minor: count("minor"),
    wrong: count("wrong"),
    disputed: count("disputed"),
    found,
    chances: options.entry.defects.length * done.length,
  };
}

export function armMetrics(options: {
  readonly arm: ArmName;
  readonly cases: readonly ReviewCase[];
  readonly runs: readonly ArmRun[];
  readonly judged: readonly JudgedCase[];
  readonly tiebreaks: ReadonlyMap<string, string>;
  readonly seed: number;
}): ArmMetrics {
  const runs = options.runs.filter((run) => run.arm === options.arm);
  const judged = new Map(options.judged.map((entry) => [entry.caseId, entry]));
  const perCase = options.cases.map((entry) =>
    caseTotals({
      arm: options.arm,
      entry,
      judged: judged.get(entry.id),
      runs: runs.filter((run) => run.caseId === entry.id),
      tiebreaks: options.tiebreaks,
    }),
  );
  const sum = (pick: (entry: (typeof perCase)[number]) => number) =>
    perCase.reduce((total, entry) => total + pick(entry), 0);
  const decided = sum((entry) => entry.real + entry.minor + entry.wrong);
  const chances = sum((entry) => entry.chances);
  const clean = perCase.filter((entry) => entry.clean && entry.completed > 0);
  const costs = runs.flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]));

  return {
    arm: options.arm,
    reviews: runs.length,
    completed: sum((entry) => entry.completed),
    findings: sum((entry) => entry.findings),
    real: sum((entry) => entry.real),
    minor: sum((entry) => entry.minor),
    wrong: sum((entry) => entry.wrong),
    disputed: sum((entry) => entry.disputed),
    realShare: decided === 0 ? null : sum((entry) => entry.real) / decided,
    realInterval: bootstrapInterval({
      cases: perCase.map((entry) => ({
        numerator: entry.real,
        denominator: entry.real + entry.minor + entry.wrong,
      })),
      seed: options.seed,
    }),
    wrongRate: decided === 0 ? null : sum((entry) => entry.wrong) / decided,
    defectsFound: sum((entry) => entry.found),
    defectChances: chances,
    recall: chances === 0 ? null : sum((entry) => entry.found) / chances,
    recallInterval: bootstrapInterval({
      cases: perCase.map((entry) => ({ numerator: entry.found, denominator: entry.chances })),
      seed: options.seed + 1,
    }),
    findingsPerCleanReview:
      clean.length === 0
        ? null
        : clean.reduce((total, entry) => total + entry.findings, 0) /
          clean.reduce((total, entry) => total + entry.completed, 0),
    medianSeconds: median(runs.flatMap((run) => runSeconds(run) ?? [])),
    meanCostUsd:
      costs.length === 0 ? null : costs.reduce((total, cost) => total + cost, 0) / costs.length,
  };
}
