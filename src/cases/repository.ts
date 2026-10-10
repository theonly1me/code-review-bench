import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "../process";
import { opaqueKey, type ReviewCase } from "./schema";

export function caseCheckout(options: { readonly work: string; readonly caseId: string }): string {
  return path.join(options.work, "repos", opaqueKey(options.caseId), "repo");
}

export async function pointCaseBranches(options: {
  readonly checkout: string;
  readonly baseSha: string;
  readonly headSha: string;
}): Promise<void> {
  const { checkout } = options;

  await git({ cwd: checkout, arguments: ["update-ref", "refs/heads/main", options.baseSha] });
  await git({ cwd: checkout, arguments: ["update-ref", "refs/heads/case", options.headSha] });
  await git({ cwd: checkout, arguments: ["symbolic-ref", "HEAD", "refs/heads/case"] });
  await git({ cwd: checkout, arguments: ["reset", "--hard", "--quiet"] });
}

export async function borrowedRepository(options: {
  readonly checkout: string;
  readonly objectsFrom: string;
}): Promise<void> {
  rmSync(options.checkout, { recursive: true, force: true });
  mkdirSync(options.checkout, { recursive: true });
  await git({ cwd: options.checkout, arguments: ["init", "--quiet", "--initial-branch=main"] });
  writeFileSync(
    path.join(options.checkout, ".git", "objects", "info", "alternates"),
    `${path.join(options.objectsFrom, ".git", "objects")}\n`,
  );
}

export async function changesWorkflows(options: {
  readonly checkout: string;
  readonly baseSha: string;
  readonly headSha: string;
}): Promise<boolean> {
  const changed = await git({
    cwd: options.checkout,
    arguments: ["diff", "--name-only", `${options.baseSha}...${options.headSha}`],
  });

  return changed.split("\n").some((file) => file.startsWith(".github/workflows/"));
}

export async function withReviewClone<Result>(options: {
  readonly entry: ReviewCase;
  readonly work: (clone: string) => Promise<Result>;
}): Promise<Result> {
  const root = mkdtempSync(path.join(os.tmpdir(), "review-"));
  const clone = path.join(root, "repo");
  const { entry } = options;

  try {
    await git({
      cwd: root,
      arguments: ["clone", "--quiet", "--shared", "--no-checkout", entry.checkout, clone],
    });
    await git({ cwd: clone, arguments: ["remote", "remove", "origin"] });
    await pointCaseBranches({ checkout: clone, baseSha: entry.baseSha, headSha: entry.headSha });
    return await options.work(clone);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
