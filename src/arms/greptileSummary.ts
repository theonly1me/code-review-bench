import { z } from "zod";

const issueCommentsSchema = z.array(
  z.object({
    id: z.number(),
    body: z.string().nullable(),
    created_at: z.string(),
    user: z.object({ login: z.string() }),
  }),
);

export type SummaryWithoutFindings = { readonly id: number; readonly createdAt: string };

export function greptileSummaryWithoutFindings(options: {
  readonly issueComments: unknown;
  readonly startedAt: string;
}): SummaryWithoutFindings | null {
  const summary = issueCommentsSchema.parse(options.issueComments).find((comment) => {
    const body = comment.body ?? "";

    return (
      /greptile/i.test(comment.user.login) &&
      comment.created_at >= options.startedAt &&
      body.includes("greptile_summary") &&
      body.includes("Confidence Score") &&
      !body.includes("Findings</h2>")
    );
  });

  return summary === undefined ? null : { id: summary.id, createdAt: summary.created_at };
}
