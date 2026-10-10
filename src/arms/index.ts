import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReviewCase } from "../cases/schema";
import { inParallel, readJsonFile } from "../process";
import { cloudRunner } from "./cloud";
import { runOpenqodexLocally } from "./openqodex";
import { runShadowcloneLocally } from "./shadowclone";
import { type ArmName, type ArmRun, armRunSchema, type ArmRunner, type ArmSettings } from "./types";

export { armNames, type ArmName, type ArmRun, type ArmSettings, type Finding } from "./types";

const runners: Readonly<Record<ArmName, ArmRunner>> = {
  shadowclone: runShadowcloneLocally,
  openqodex: runOpenqodexLocally,
  "shadowclone-cloud": cloudRunner("shadowclone-cloud"),
  greptile: cloudRunner("greptile"),
};

export type PlannedReview = {
  readonly entry: ReviewCase;
  readonly repeat: number;
  readonly directory: string;
};

export function runDirectory(options: {
  readonly runs: string;
  readonly arm: ArmName;
  readonly caseId: string;
  readonly repeat: number;
}): string {
  return path.join(options.runs, options.arm, options.caseId, String(options.repeat));
}

export function readArmRun(directory: string): ArmRun | null {
  const file = path.join(directory, "run.json");

  return existsSync(file) ? armRunSchema.parse(readJsonFile(file)) : null;
}

export function plannedReviews(options: {
  readonly arm: ArmName;
  readonly cases: readonly ReviewCase[];
  readonly runs: string;
  readonly repeats: number;
}): readonly PlannedReview[] {
  const repeats = Array.from({ length: options.repeats }, (_, index) => index + 1);

  return repeats.flatMap((repeat) =>
    options.cases
      .map((entry) => ({
        entry,
        repeat,
        directory: runDirectory({ runs: options.runs, arm: options.arm, caseId: entry.id, repeat }),
      }))
      .filter((planned) => readArmRun(planned.directory)?.status !== "done"),
  );
}

export async function runReviews(options: {
  readonly arm: ArmName;
  readonly planned: readonly PlannedReview[];
  readonly settings: ArmSettings;
  readonly limit: number;
}): Promise<readonly ArmRun[]> {
  const runner = runners[options.arm];

  return inParallel({
    items: options.planned,
    limit: options.limit,
    work: async ({ entry, repeat, directory }) => {
      mkdirSync(directory, { recursive: true });

      const run = await runner({ entry, repeat, directory, settings: options.settings });

      writeFileSync(path.join(directory, "run.json"), JSON.stringify(run, null, 2));
      console.error(
        `${options.arm} ${entry.id} #${repeat}: ${run.status} (${run.detail.slice(0, 120)})`,
      );
      return run;
    },
  });
}
