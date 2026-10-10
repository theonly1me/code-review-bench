import { existsSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { armNames, type Finding } from "../arms";
import { withReviewClone } from "../cases/repository";
import type { ReviewCase } from "../cases/schema";
import { git, inParallel, readJsonFile } from "../process";
import { askJudges } from "./judges";
import { judgeAnswerSchema } from "./labels";
import { type BlindFinding, judgePrompt, judgmentSchema } from "./prompt";

const maximumDiffLength = 120_000;

export const judgedFindingSchema = z.object({
  id: z.string(),
  arm: z.enum(armNames),
  repeat: z.number().int().positive(),
  path: z.string(),
  line: z.number().nullable(),
  text: z.string(),
});

export const judgedCaseSchema = z.object({
  caseId: z.string(),
  findings: z.array(judgedFindingSchema),
  answers: z.array(judgeAnswerSchema),
});

export type JudgedCase = z.infer<typeof judgedCaseSchema>;

export function blindId(seed: string): string {
  return `F${new Bun.CryptoHasher("sha256").update(seed).digest("hex").slice(0, 8)}`;
}

export function blindFindings(options: {
  readonly caseId: string;
  readonly findings: readonly Finding[];
  readonly seed: string;
}): JudgedCase["findings"] {
  return options.findings
    .map((finding, index) => ({
      id: blindId(`${options.seed}:${options.caseId}:${finding.arm}:${finding.repeat}:${index}`),
      arm: finding.arm,
      repeat: finding.repeat,
      path: finding.path,
      line: finding.line,
      text: finding.text,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sameFindings(options: {
  readonly previous: JudgedCase | undefined;
  readonly findings: JudgedCase["findings"];
}): boolean {
  const previousIds = options.previous?.findings.map((finding) => finding.id).join(",");

  return (
    previousIds === options.findings.map((finding) => finding.id).join(",") &&
    (options.previous?.answers.every((answer) => answer.output !== null) ?? false)
  );
}

export function readJudged(file: string): readonly JudgedCase[] {
  return existsSync(file) ? z.array(judgedCaseSchema).parse(readJsonFile(file)) : [];
}

export async function judgeCases(options: {
  readonly cases: readonly ReviewCase[];
  readonly findingsByCase: ReadonlyMap<string, readonly Finding[]>;
  readonly output: string;
  readonly seed: string;
}): Promise<readonly JudgedCase[]> {
  const previous = new Map(readJudged(options.output).map((entry) => [entry.caseId, entry]));
  const judged = await inParallel({
    items: options.cases,
    limit: 4,
    work: async (entry): Promise<JudgedCase> => {
      const findings = blindFindings({
        caseId: entry.id,
        findings: options.findingsByCase.get(entry.id) ?? [],
        seed: options.seed,
      });
      const known = previous.get(entry.id);

      if (known !== undefined && sameFindings({ previous: known, findings })) {
        return known;
      }

      if (findings.length === 0) {
        return { caseId: entry.id, findings, answers: [] };
      }

      const answers = await withReviewClone({
        entry,
        work: async (clone) =>
          askJudges({
            prompt: judgePrompt({
              title: entry.title,
              diff: (
                await git({
                  cwd: clone,
                  arguments: ["diff", "--no-color", `${entry.baseSha}...${entry.headSha}`],
                })
              ).slice(0, maximumDiffLength),
              findings: findings.map(({ id, path, line, text }): BlindFinding => ({
                id,
                path,
                line,
                text,
              })),
              defects: entry.defects,
            }),
            schema: judgmentSchema,
            cwd: clone,
          }),
      });

      console.error(`judged ${entry.id}: ${findings.length} findings`);
      return { caseId: entry.id, findings, answers: [...answers] };
    },
  });

  writeFileSync(options.output, JSON.stringify(judged, null, 2));
  return judged;
}
