import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runProcess } from "../runProcess";
import { withReviewClone } from "../cases/repository";
import { readJsonFile } from "../process";
import { openqodexRelease } from "../suites/openqodex";
import { type ArmRunner, failedRun } from "./types";

const usageSchema = z.object({
  completion: z
    .object({
      reviewer: z
        .object({
          usage: z.object({ cost_usd: z.number().nullable().optional() }).nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export function openqodexArguments(options: {
  readonly reportDirectory: string;
  readonly timeoutSeconds: number;
}): readonly string[] {
  return [
    "npx",
    "-y",
    `openqodex@${openqodexRelease.version}`,
    "review",
    "--base",
    "main",
    "--reviewer",
    "claude",
    "--reviewer-web",
    "on",
    "--timeout",
    String(options.timeoutSeconds),
    "--report-dir",
    options.reportDirectory,
    "--format",
    "json",
  ];
}

export const runOpenqodexLocally: ArmRunner = async ({ entry, repeat, directory, settings }) => {
  const startedAt = new Date().toISOString();
  const reportDirectory = path.join(directory, "report");

  mkdirSync(reportDirectory, { recursive: true });

  try {
    const result = await withReviewClone({
      entry,
      work: (clone) =>
        runProcess({
          arguments: openqodexArguments({
            reportDirectory,
            timeoutSeconds: settings.openqodexTimeoutSeconds,
          }),
          cwd: clone,
          environment: { ...process.env, ANTHROPIC_MODEL: settings.model },
          timeoutMilliseconds: (settings.openqodexTimeoutSeconds + 600) * 1000,
        }),
    });
    const reportFile = path.join(reportDirectory, "report.json");
    const report: unknown = existsSync(reportFile) ? readJsonFile(reportFile) : null;

    writeFileSync(path.join(directory, "stderr.log"), result.stderr);

    return {
      arm: "openqodex",
      caseId: entry.id,
      repeat,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: report === null ? "failed" : "done",
      detail: `exit ${result.exitCode}: ${result.stderr.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`,
      costUsd: usageSchema.safeParse(report).data?.completion?.reviewer?.usage?.cost_usd ?? null,
      raw: report,
    };
  } catch (error) {
    return failedRun({ arm: "openqodex", entry, repeat, startedAt, error });
  }
};
