import { z } from "zod";
import { shadowcloneReviewMarker } from "./shadowcloneResult";
import { ghJson } from "../process";
import { greptileSummaryWithoutFindings } from "./greptileSummary";
import type { ArmRun, ArmRunner, CloudArmName } from "./types";

const reviewsSchema = z.array(
  z.object({
    id: z.number(),
    body: z.string().nullable(),
    submitted_at: z.string().nullable(),
    user: z.object({ login: z.string() }),
  }),
);

const pollTimeoutMilliseconds = 45 * 60_000;

const pollIntervalMilliseconds = 30_000;

export async function reviewActivity(options: {
  readonly repository: string;
  readonly number: number;
}) {
  const [reviews, reviewComments, issueComments] = await Promise.all([
    ghJson(["api", "--paginate", `repos/${options.repository}/pulls/${options.number}/reviews`]),
    ghJson(["api", "--paginate", `repos/${options.repository}/pulls/${options.number}/comments`]),
    ghJson(["api", "--paginate", `repos/${options.repository}/issues/${options.number}/comments`]),
  ]);

  return { reviews, reviewComments, issueComments };
}

export function isArmReview(options: {
  readonly arm: CloudArmName;
  readonly body: string | null;
  readonly login: string;
}): boolean {
  return options.arm === "greptile"
    ? /greptile/i.test(options.login)
    : (options.body ?? "").includes(shadowcloneReviewMarker);
}

function requestBody(options: { readonly arm: CloudArmName; readonly bot: string | null }): string {
  if (options.arm === "greptile") {
    return "@greptileai";
  }

  if (options.bot === null) {
    throw new Error("the shadowclone-cloud arm needs --shadowclone-bot <app or account login>");
  }

  return `@${options.bot} review`;
}

async function waitForReview(options: {
  readonly arm: CloudArmName;
  readonly repository: string;
  readonly number: number;
  readonly startedAt: string;
}) {
  const deadline = Date.now() + pollTimeoutMilliseconds;
  let quietSummarySeen = false;

  while (Date.now() < deadline) {
    await Bun.sleep(pollIntervalMilliseconds);

    const activity = await reviewActivity(options).catch(() => null);

    if (activity === null) {
      continue;
    }

    const found = reviewsSchema
      .parse(activity.reviews)
      .find(
        (review) =>
          isArmReview({ arm: options.arm, body: review.body, login: review.user.login }) &&
          (review.submitted_at ?? "") >= options.startedAt,
      );

    if (found !== undefined) {
      return { id: found.id, submittedAt: found.submitted_at, activity };
    }

    const quietSummary =
      options.arm === "greptile"
        ? greptileSummaryWithoutFindings({
            issueComments: activity.issueComments,
            startedAt: options.startedAt,
          })
        : null;

    if (quietSummary !== null && quietSummarySeen) {
      return { id: quietSummary.id, submittedAt: quietSummary.createdAt, activity };
    }

    quietSummarySeen = quietSummary !== null;
  }

  return null;
}

export function cloudRunner(arm: CloudArmName): ArmRunner {
  return async ({ entry, repeat, settings }): Promise<ArmRun> => {
    const startedAt = new Date().toISOString();
    const base = { arm, caseId: entry.id, repeat, startedAt, costUsd: null };

    if (entry.pull === null) {
      return {
        ...base,
        finishedAt: null,
        status: "skipped",
        detail: "the case has no pull request copy",
        raw: null,
      };
    }

    const { repository, number } = entry.pull;

    await ghJson([
      "api",
      "--method",
      "POST",
      `repos/${repository}/issues/${number}/comments`,
      "-f",
      `body=${requestBody({ arm, bot: settings.shadowcloneBot })}`,
    ]);

    const review = await waitForReview({ arm, repository, number, startedAt });

    return review === null
      ? {
          ...base,
          finishedAt: null,
          status: "timed-out",
          detail: "no review within 45 minutes",
          raw: null,
        }
      : {
          ...base,
          finishedAt: review.submittedAt,
          status: "done",
          detail: `review ${review.id}`,
          raw: review.activity,
        };
  };
}
