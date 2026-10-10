import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runProcess } from "../runProcess";
import { caseCheckout, changesWorkflows, pointCaseBranches } from "../cases/repository";
import type { Defect, ReviewCase, SplitName } from "../cases/schema";
import { git, readJsonFile } from "../process";

export const openqodexRelease = {
  version: "0.11.0",
  commit: "2f2fa9e48c1f62a6123997eb14111140d8e22a74",
} as const;

export const neutralChangeMessage = "Apply the change";

const bugSchema = z.object({
  id: z.string(),
  file: z.string(),
  lines: z.tuple([z.number(), z.number()]),
  also: z
    .array(z.object({ file: z.string(), lines: z.tuple([z.number(), z.number()]) }))
    .optional(),
  severity: z.string(),
  truth: z.string(),
});

export const openqodexSpecSchema = z.object({
  id: z.string(),
  clean: z.boolean(),
  bugs: z.array(bugSchema).optional(),
});

export function openqodexSourceDirectory(work: string): string {
  return path.join(work, "sources", "openqodex");
}

export async function fetchOpenqodexSource(work: string): Promise<string> {
  const source = openqodexSourceDirectory(work);

  if (!existsSync(source)) {
    await git({
      cwd: work,
      arguments: ["clone", "--quiet", "https://github.com/openqodex/openqodex.git", source],
    });
  }

  await git({
    cwd: source,
    arguments: ["checkout", "--quiet", "--detach", openqodexRelease.commit],
  });
  return source;
}

function defectSeverity(severity: string): Defect["severity"] {
  return severity === "critical" || severity === "major" ? severity : "minor";
}

export function openqodexDefects(spec: z.infer<typeof openqodexSpecSchema>): readonly Defect[] {
  return (spec.bugs ?? []).map((bug) => ({
    id: bug.id,
    summary: bug.truth,
    fix: "",
    severity: defectSeverity(bug.severity),
    locations: [
      { path: bug.file, lines: bug.lines },
      ...(bug.also ?? []).map((location) => ({ path: location.file, lines: location.lines })),
    ],
  }));
}

async function buildCase(options: {
  readonly work: string;
  readonly source: string;
  readonly id: string;
  readonly split: SplitName;
}): Promise<ReviewCase> {
  const checkout = caseCheckout({ work: options.work, caseId: `openqodex-${options.id}` });

  rmSync(path.dirname(checkout), { recursive: true, force: true });

  const built = await runProcess({
    arguments: ["node", path.join(options.source, "benchmark", "build.mjs"), options.id, checkout],
    cwd: options.source,
    environment: process.env,
    timeoutMilliseconds: 300_000,
  });

  if (built.exitCode !== 0) {
    throw new Error(
      `their build.mjs failed for ${options.id}: ${built.stderr.trim().slice(0, 300)}`,
    );
  }

  const baseSha = await git({ cwd: checkout, arguments: ["rev-parse", "HEAD"] });

  await git({ cwd: checkout, arguments: ["add", "--all"] });
  await git({ cwd: checkout, arguments: ["commit", "--quiet", "--message", neutralChangeMessage] });

  const headSha = await git({ cwd: checkout, arguments: ["rev-parse", "HEAD"] });
  const spec = openqodexSpecSchema.parse(
    readJsonFile(path.join(options.source, "benchmark", "cases", options.id, "case.json")),
  );

  await pointCaseBranches({ checkout, baseSha, headSha });

  return {
    id: `openqodex-${options.id}`,
    suite: "openqodex",
    split: options.split,
    title: neutralChangeMessage,
    description: "",
    checkout,
    baseSha,
    headSha,
    changesWorkflows: await changesWorkflows({ checkout, baseSha, headSha }),
    defects: [...openqodexDefects(spec)],
    openqodexSpec: readJsonFile(
      path.join(options.source, "benchmark", "cases", options.id, "case.json"),
    ),
    pull: null,
  };
}

export async function buildOpenqodexCases(options: {
  readonly work: string;
  readonly only?: readonly string[];
}): Promise<readonly ReviewCase[]> {
  const source = await fetchOpenqodexSource(options.work);
  const casesRoot = path.join(source, "benchmark", "cases");
  const ids = readdirSync(casesRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(path.join(casesRoot, entry.name, "case.json")),
    )
    .map((entry) => entry.name)
    .filter((id) => options.only === undefined || options.only.includes(id))
    .sort();
  const cases: ReviewCase[] = [];

  for (const id of ids) {
    cases.push(await buildCase({ work: options.work, source, id, split: "scored" }));
    console.error(`built openqodex case ${id}`);
  }

  return cases;
}
