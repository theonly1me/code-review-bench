import { z } from "zod";
import { opaqueKey, type ReviewCase } from "../cases/schema";
import { ghJson, git } from "../process";
import { sanitizeBody } from "./sanitize";
import { treeWithoutWorkflows } from "./tree";

const createdPullSchema = z.object({ number: z.number().int().positive() });

export function copyBranchNames(caseId: string): { readonly base: string; readonly head: string } {
  const key = opaqueKey(caseId);

  return { base: `case-${key}/base`, head: `case-${key}/head` };
}

async function copyCase(options: {
  readonly entry: ReviewCase;
  readonly evalRepository: string;
}): Promise<ReviewCase> {
  const { entry } = options;
  const checkout = entry.checkout;
  const base = await git({
    cwd: checkout,
    arguments: [
      "commit-tree",
      await treeWithoutWorkflows({ checkout, commit: entry.baseSha }),
      "-m",
      "Base",
    ],
  });
  const head = await git({
    cwd: checkout,
    arguments: [
      "commit-tree",
      await treeWithoutWorkflows({ checkout, commit: entry.headSha }),
      "-p",
      base,
      "-m",
      entry.title,
    ],
  });
  const branches = copyBranchNames(entry.id);

  await git({
    cwd: checkout,
    arguments: [
      "push",
      "--quiet",
      "--force",
      `git@github.com:${options.evalRepository}.git`,
      `${base}:refs/heads/${branches.base}`,
      `${head}:refs/heads/${branches.head}`,
    ],
  });

  const created = createdPullSchema.parse(
    await ghJson([
      "api",
      "--method",
      "POST",
      `repos/${options.evalRepository}/pulls`,
      "-f",
      `title=${sanitizeBody(entry.title)}`,
      "-f",
      `body=${sanitizeBody(entry.description)}`,
      "-f",
      `head=${branches.head}`,
      "-f",
      `base=${branches.base}`,
      "-F",
      "draft=true",
    ]),
  );

  return { ...entry, pull: { repository: options.evalRepository, number: created.number } };
}

export async function copyCases(options: {
  readonly cases: readonly ReviewCase[];
  readonly evalRepository: string;
}): Promise<readonly ReviewCase[]> {
  const copied: ReviewCase[] = [];

  for (const entry of options.cases) {
    if (entry.pull !== null || entry.changesWorkflows) {
      copied.push(entry);
      console.error(
        entry.changesWorkflows
          ? `skipped ${entry.id}: its change edits a workflow`
          : `kept ${entry.id}: already copied`,
      );
      continue;
    }

    copied.push(await copyCase({ entry, evalRepository: options.evalRepository }));
    console.error(`copied ${entry.id}`);
  }

  return copied;
}
