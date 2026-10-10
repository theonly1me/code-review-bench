import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withReviewClone } from "../cases/repository";
import { readJsonFile } from "../process";
import { runProcess } from "../runProcess";
import { shadowcloneResultSchema } from "./shadowcloneResult";
import { type ArmRunner, failedRun } from "./types";

const reviewTimeoutMilliseconds = 60 * 60_000;

export const runShadowcloneLocally: ArmRunner = async ({ entry, repeat, directory, settings }) => {
  const startedAt = new Date().toISOString();
  const reviewFile = path.join(directory, "review.json");

  try {
    const result = await withReviewClone({
      entry,
      work: (clone) =>
        runProcess({
          arguments: [
            ...settings.shadowclone.arguments,
            "review",
            "--base",
            "main",
            "--model",
            settings.model,
            "--output",
            reviewFile,
          ],
          cwd: clone,
          environment: process.env,
          timeoutMilliseconds: reviewTimeoutMilliseconds,
        }),
    });

    writeFileSync(path.join(directory, "progress.log"), result.stderr);

    if (result.exitCode !== 0 || !existsSync(reviewFile)) {
      throw new Error(
        `shadowclone review exited with ${result.exitCode}: ${result.stderr.trim().split("\n").slice(-3).join(" | ")}`,
      );
    }

    const raw = readJsonFile(reviewFile);
    const review = shadowcloneResultSchema.parse(raw);

    return {
      arm: "shadowclone",
      caseId: entry.id,
      repeat,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "done",
      detail: `${review.findings.length} findings`,
      costUsd: review.statistics.costUsd,
      raw,
    };
  } catch (error) {
    return failedRun({ arm: "shadowclone", entry, repeat, startedAt, error });
  }
};
