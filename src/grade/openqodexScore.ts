import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runProcess } from "../runProcess";
import { type ShadowcloneResult, shadowcloneResultSchema } from "../arms/shadowcloneResult";
import type { ArmRun } from "../arms";
import type { ReviewCase } from "../cases/schema";
import { openqodexSourceDirectory, openqodexSpecSchema } from "../suites/openqodex";
import { runSeconds } from "./collect";

type Finding = ShadowcloneResult["findings"][number];

const theirCategories: Readonly<Record<Finding["category"], string>> = {
  correctness: "bug",
  security: "security",
  performance: "performance",
  standards: "maintainability",
  tests: "maintainability",
};

const theirSeverities: Readonly<Record<Finding["severity"], string>> = {
  high: "major",
  medium: "minor",
  low: "nitpick",
};

export function theirReport(result: ShadowcloneResult): unknown {
  return {
    findings: result.findings.map((finding) => ({
      file_path: finding.path,
      line_number: finding.line,
      line_end: finding.line,
      category: theirCategories[finding.category],
      severity: theirSeverities[finding.severity],
      title: finding.title,
      description: finding.explanation,
      problem: finding.explanation,
      consequence: finding.failureScenario,
      fix: finding.suggestion ?? "",
      suggested_change: null,
    })),
    outside_change: [],
    completion: { status: "complete" },
  };
}

function reportFor(run: ArmRun): unknown {
  if (run.status !== "done" || run.raw === null) {
    return null;
  }

  return run.arm === "shadowclone" ? theirReport(shadowcloneResultSchema.parse(run.raw)) : run.raw;
}

export function writeTheirLayout(options: {
  readonly folder: string;
  readonly cases: readonly ReviewCase[];
  readonly runs: readonly ArmRun[];
  readonly model: string;
}): number {
  rmSync(options.folder, { recursive: true, force: true });
  mkdirSync(path.join(options.folder, "cases"), { recursive: true });

  let samples = 0;

  for (const entry of options.cases.filter((candidate) => candidate.suite === "openqodex")) {
    const spec = openqodexSpecSchema.parse(entry.openqodexSpec);

    writeFileSync(
      path.join(options.folder, "cases", `${spec.id}.json`),
      JSON.stringify(entry.openqodexSpec, null, 2),
    );

    for (const run of options.runs.filter(
      (candidate) =>
        candidate.caseId === entry.id &&
        (candidate.arm === "shadowclone" || candidate.arm === "openqodex"),
    )) {
      const sample = path.join(options.folder, "samples", spec.id, run.arm, String(run.repeat));
      const report = reportFor(run);
      const seconds = runSeconds(run);

      mkdirSync(path.join(sample, "report"), { recursive: true });
      writeFileSync(
        path.join(sample, "sample.json"),
        JSON.stringify({
          case: spec.id,
          config: run.arm,
          repeat: run.repeat,
          attempt: 1,
          wallMs: seconds === null ? null : seconds * 1000,
        }),
      );

      if (report !== null) {
        writeFileSync(path.join(sample, "report", "report.json"), JSON.stringify(report));
      }

      samples += 1;
    }
  }

  writeFileSync(
    path.join(options.folder, "manifest.json"),
    JSON.stringify(
      {
        build: { source: "code-review-bench" },
        reviewer: { model: options.model },
        repeat: null,
        planned: samples,
        ended: "complete",
      },
      null,
      2,
    ),
  );
  return samples;
}

export async function scoreWithTheirScorer(options: {
  readonly work: string;
  readonly folder: string;
}): Promise<string> {
  const result = await runProcess({
    arguments: [
      "node",
      path.join(openqodexSourceDirectory(options.work), "benchmark", "score.mjs"),
      options.folder,
    ],
    cwd: openqodexSourceDirectory(options.work),
    environment: process.env,
    timeoutMilliseconds: 300_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`their score.mjs failed: ${result.stderr.trim().slice(0, 500)}`);
  }

  return result.stdout;
}
