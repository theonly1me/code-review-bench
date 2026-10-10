import type { ReviewCase } from "../cases/schema";
import { git } from "../process";
import { treeWithoutWorkflows } from "./tree";

async function baseCommitTime(entry: ReviewCase): Promise<number> {
  return Number(
    await git({ cwd: entry.checkout, arguments: ["show", "-s", "--format=%ct", entry.baseSha] }),
  );
}

export async function pushMainBranch(options: {
  readonly cases: readonly ReviewCase[];
  readonly evalRepository: string;
}): Promise<"pushed" | "kept"> {
  const remote = `git@github.com:${options.evalRepository}.git`;
  const [first] = options.cases;

  if (first === undefined) {
    throw new Error("no case to build the main branch from");
  }

  const existing = await git({
    cwd: first.checkout,
    arguments: ["ls-remote", remote, "refs/heads/main"],
  });

  if (existing !== "") {
    return "kept";
  }

  const dated = await Promise.all(
    options.cases.map(async (entry) => ({ entry, time: await baseCommitTime(entry) })),
  );
  const oldest = dated.reduce((older, candidate) =>
    candidate.time < older.time ? candidate : older,
  );
  const { checkout, baseSha } = oldest.entry;
  const commit = await git({
    cwd: checkout,
    arguments: [
      "commit-tree",
      "-S",
      await treeWithoutWorkflows({ checkout, commit: baseSha }),
      "-m",
      "Base",
    ],
  });

  await git({
    cwd: checkout,
    arguments: ["push", "--quiet", remote, `${commit}:refs/heads/main`],
  });
  return "pushed";
}
