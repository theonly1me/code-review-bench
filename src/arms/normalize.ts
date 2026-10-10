import { z } from "zod";
import { shadowcloneResultSchema } from "./shadowcloneResult";
import { activitySchema } from "./activity";
import { isArmReview } from "./cloud";
import { plainText } from "./plainText";
import type { ArmRun, Finding } from "./types";

const bodyFindingStart = /\n\n(?=`[^`\n]+:\d+`\n)/;

const openqodexFindingSchema = z.object({
  file_path: z.string(),
  line_number: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  severity: z.string().optional(),
  problem: z.string().optional(),
  consequence: z.string().optional(),
  fix: z.string().optional(),
  suggested_change: z.string().nullable(),
});

export const openqodexReportSchema = z.object({
  findings: z.array(openqodexFindingSchema),
  outside_change: z.array(openqodexFindingSchema),
});

type Base = Pick<Finding, "arm" | "caseId" | "repeat">;

function shadowcloneLocal(options: {
  readonly base: Base;
  readonly raw: unknown;
}): readonly Finding[] {
  return shadowcloneResultSchema.parse(options.raw).findings.map((finding) => ({
    ...options.base,
    path: finding.path,
    line: finding.line,
    title: finding.title,
    text: plainText(
      [finding.title, finding.explanation, finding.failureScenario, finding.suggestion ?? ""].join(
        " ",
      ),
    ),
    category: finding.category,
    severity: finding.severity,
  }));
}

function openqodexLocal(options: {
  readonly base: Base;
  readonly raw: unknown;
}): readonly Finding[] {
  const report = openqodexReportSchema.parse(options.raw);

  return [...report.findings, ...report.outside_change].map((finding) => ({
    ...options.base,
    path: finding.file_path,
    line: finding.line_number,
    title: finding.title,
    text: plainText(
      [
        finding.title,
        finding.problem ?? finding.description,
        finding.consequence ?? "",
        finding.fix ?? finding.suggested_change ?? "",
      ].join(" "),
    ),
    category: finding.category ?? null,
    severity: finding.severity ?? null,
  }));
}

function cloud(options: {
  readonly base: Base;
  readonly raw: unknown;
  readonly startedAt: string;
}): readonly Finding[] {
  const { base } = options;
  const arm = base.arm === "greptile" ? "greptile" : "shadowclone-cloud";
  const activity = activitySchema.parse(options.raw);
  const reviews = activity.reviews.filter(
    (review) =>
      isArmReview({ arm, body: review.body, login: review.user.login }) &&
      (review.submitted_at ?? "") >= options.startedAt,
  );
  const reviewIds = new Set(reviews.map((review) => review.id));
  const inline = activity.reviewComments
    .filter(
      (comment) =>
        comment.pull_request_review_id !== null && reviewIds.has(comment.pull_request_review_id),
    )
    .map((comment) => ({
      ...base,
      path: comment.path,
      line: comment.line ?? comment.original_line ?? null,
      title: "",
      text: plainText(comment.body),
      category: null,
      severity: null,
    }));
  const [firstReview] = reviews;
  const outside =
    arm === "greptile" || firstReview === undefined
      ? []
      : (firstReview.body ?? "")
          .split(bodyFindingStart)
          .slice(1)
          .flatMap((section) => {
            const match = /^`([^`\n]+):(\d+)`\n/.exec(section);

            return match?.[1] && match[2]
              ? [
                  {
                    ...base,
                    path: match[1],
                    line: Number(match[2]),
                    title: "",
                    text: plainText(section.slice(match[0].length)),
                    category: null,
                    severity: null,
                  },
                ]
              : [];
          });

  return [...inline, ...outside];
}

export function armFindings(run: ArmRun): readonly Finding[] {
  if (run.status !== "done" || run.raw === null) {
    return [];
  }

  const base = { arm: run.arm, caseId: run.caseId, repeat: run.repeat };

  if (run.arm === "shadowclone") {
    return shadowcloneLocal({ base, raw: run.raw });
  }

  return run.arm === "openqodex"
    ? openqodexLocal({ base, raw: run.raw })
    : cloud({ base, raw: run.raw, startedAt: run.startedAt });
}
