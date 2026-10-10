import { z } from "zod";

export const shadowcloneReviewMarker = "<!-- shadowclone-review -->";

const findingSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum(["correctness", "security", "performance", "standards", "tests"]),
  title: z.string(),
  explanation: z.string(),
  failureScenario: z.string(),
  suggestion: z.string().nullable(),
});

export const shadowcloneResultSchema = z.object({
  version: z.literal(1),
  model: z.string(),
  findings: z.array(findingSchema),
  statistics: z.object({ costUsd: z.number().nonnegative().nullable() }),
});

export type ShadowcloneResult = z.infer<typeof shadowcloneResultSchema>;
