import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { opaqueKey, type ReviewCase } from "../cases/schema";
import { ghJson, git } from "../process";
import { sanitizeBody } from "./sanitize";

const createdPullSchema = z.object({ number: z.number().int().positive() });

async function treeWithoutWorkflows(options: {
  readonly checkout: string;
  readonly commit: string;
}): Promise<string> {
  const directory = mkdtempSync(path.join(os.tmpdir(), "review-index-"));
  const environment = { GIT_INDEX_FILE: path.join(directory, "index") };

  try {
    await git({ cwd: options.checkout, arguments: ["read-tree", options.commit], environment });
    await git({
      cwd: options.checkout,
      arguments: ["rm", "--cached", "-r", "-q", "-f", "--ignore-unmatch", ".github/workflows"],
      environment,
    });
    return await git({ cwd: options.checkout, arguments: ["write-tree"], environment });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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
      "-S",
      await treeWithoutWorkflows({ checkout, commit: entry.baseSha }),
      "-m",
      "Base",
    ],
  });
  const head = await git({
    cwd: checkout,
    arguments: [
      "commit-tree",
      "-S",
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
