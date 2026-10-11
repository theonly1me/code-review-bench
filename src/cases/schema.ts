import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJsonFile } from "../process";

export const suiteNames = ["real", "planted"] as const;

export const splitNames = ["dev", "scored"] as const;

export type SuiteName = (typeof suiteNames)[number];

export type SplitName = (typeof splitNames)[number];

const commitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const defectSchema = z.object({
  id: z.string().min(1).max(80),
  summary: z.string().min(1).max(2_000),
  fix: z.string().max(60_000),
  severity: z.enum(["critical", "major", "minor"]).nullable(),
  locations: z.array(
    z.object({
      path: z.string().min(1),
      lines: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    }),
  ),
});

export type Defect = z.infer<typeof defectSchema>;

export const reviewCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  suite: z.enum(suiteNames),
  split: z.enum(splitNames),
  title: z.string().max(1_000),
  description: z.string().max(65_536),
  checkout: z.string().min(1),
  baseSha: commitShaSchema,
  headSha: commitShaSchema,
  changesWorkflows: z.boolean(),
  defects: z.array(defectSchema),
  pull: z.object({ repository: z.string(), number: z.number().int().positive() }).nullable(),
});

export type ReviewCase = z.infer<typeof reviewCaseSchema>;

export function isCleanCase(entry: ReviewCase): boolean {
  return entry.defects.length === 0;
}

export function casesFile(options: {
  readonly work: string;
  readonly suite: SuiteName;
  readonly split: SplitName;
}): string {
  return path.join(options.work, "cases", `${options.suite}-${options.split}.json`);
}

export function readCases(file: string): readonly ReviewCase[] {
  return existsSync(file) ? z.array(reviewCaseSchema).parse(readJsonFile(file)) : [];
}

export function writeCases(options: {
  readonly file: string;
  readonly cases: readonly ReviewCase[];
}): void {
  mkdirSync(path.dirname(options.file), { recursive: true });
  writeFileSync(
    options.file,
    JSON.stringify(z.array(reviewCaseSchema).parse(options.cases), null, 2),
  );
}

export function opaqueKey(caseId: string): string {
  return new Bun.CryptoHasher("sha256").update(`review-case:${caseId}`).digest("hex").slice(0, 12);
}
