import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { type ArmName, type ArmRun, armNames, type Finding } from "../arms";
import { readArmRun } from "../arms/index";
import { armFindings } from "../arms/normalize";
import type { ReviewCase } from "../cases/schema";

function directories(directory: string): readonly string[] {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
}

export function collectRuns(options: {
  readonly runs: string;
  readonly cases: readonly ReviewCase[];
  readonly arms?: readonly ArmName[];
}): readonly ArmRun[] {
  const caseIds = new Set(options.cases.map((entry) => entry.id));

  return (options.arms ?? armNames).flatMap((arm) =>
    directories(path.join(options.runs, arm))
      .filter((caseId) => caseIds.has(caseId))
      .flatMap((caseId) =>
        directories(path.join(options.runs, arm, caseId)).flatMap(
          (repeat) => readArmRun(path.join(options.runs, arm, caseId, repeat)) ?? [],
        ),
      ),
  );
}

export function findingsByCase(runs: readonly ArmRun[]): ReadonlyMap<string, readonly Finding[]> {
  const grouped = new Map<string, Finding[]>();

  for (const run of runs) {
    grouped.set(run.caseId, [...(grouped.get(run.caseId) ?? []), ...armFindings(run)]);
  }

  return grouped;
}

export function runSeconds(run: ArmRun): number | null {
  return run.finishedAt === null
    ? null
    : Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000);
}
