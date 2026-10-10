import path from "node:path";
import { z } from "zod";
import {
  borrowedRepository,
  caseCheckout,
  changesWorkflows,
  pointCaseBranches,
} from "../../cases/repository";
import type { ReviewCase, SplitName } from "../../cases/schema";
import { git, readJsonFile } from "../../process";
import { readPulls } from "./mine";
import type { UpstreamPull } from "./pulls";
import { type SelectedCase, selectRealCases } from "./sample";
import { validatedSchema } from "./validate";

const maximumFixDiffLength = 40_000;

async function upstreamHead(options: {
  readonly clone: string;
  readonly number: number;
}): Promise<string> {
  const pullRef = `refs/upstream-pulls/${options.number}`;
  const known = await git({
    cwd: options.clone,
    arguments: ["rev-parse", "--quiet", "--verify", pullRef],
  }).catch(() => "");

  if (known === "") {
    await git({
      cwd: options.clone,
      arguments: ["fetch", "--quiet", "origin", `+refs/pull/${options.number}/head:${pullRef}`],
    });
  }

  return git({ cwd: options.clone, arguments: ["rev-parse", pullRef] });
}

async function fixDiff(options: {
  readonly clone: string;
  readonly fixCommit: string | undefined;
}): Promise<string> {
  if (options.fixCommit === undefined) {
    return "";
  }

  const diff = await git({
    cwd: options.clone,
    arguments: ["diff", "--no-color", `${options.fixCommit}^`, options.fixCommit],
  });

  return diff.slice(0, maximumFixDiffLength);
}

async function prepareCase(options: {
  readonly entry: SelectedCase;
  readonly upstream: UpstreamPull;
  readonly clone: string;
  readonly work: string;
  readonly split: SplitName;
  readonly fixCommit: string | undefined;
}): Promise<ReviewCase> {
  const { entry, clone } = options;
  const id = `real-${options.split}-${entry.id}`;
  const head = await upstreamHead({ clone, number: entry.upstream });
  const baseSha = await git({
    cwd: clone,
    arguments: ["merge-base", options.upstream.base.sha, head],
  });
  const description = (options.upstream.body ?? "").trim();
  const message = `${options.upstream.title}\n\n${description}`.trim();
  const headSha = await git({
    cwd: clone,
    arguments: ["commit-tree", "-S", `${head}^{tree}`, "-p", baseSha, "-m", message],
  });
  const checkout = caseCheckout({ work: options.work, caseId: id });

  await borrowedRepository({ checkout, objectsFrom: clone });
  await pointCaseBranches({ checkout, baseSha, headSha });

  return {
    id,
    suite: "real",
    split: options.split,
    title: options.upstream.title,
    description,
    checkout,
    baseSha,
    headSha,
    changesWorkflows: await changesWorkflows({ checkout, baseSha, headSha }),
    defects:
      entry.kind === "defect"
        ? [
            {
              id: "d1",
              summary: entry.defect ?? "",
              fix: await fixDiff({ clone, fixCommit: options.fixCommit }),
              severity: null,
              locations: [],
            },
          ]
        : [],
    pull: null,
  };
}

export async function prepareRealCases(options: {
  readonly mined: string;
  readonly clone: string;
  readonly work: string;
  readonly split: SplitName;
  readonly clean: number;
  readonly seed: number;
}): Promise<readonly ReviewCase[]> {
  const selected = selectRealCases({
    mined: options.mined,
    clean: options.clean,
    seed: options.seed,
  });
  const pulls = new Map(readPulls(options.mined).map((pull) => [pull.number, pull]));
  const validated = z
    .array(validatedSchema)
    .parse(readJsonFile(path.join(options.mined, "validated.json")));
  const fixCommits = new Map(validated.map((entry) => [entry.fix, entry.fixCommit]));
  const prepared: ReviewCase[] = [];

  for (const entry of selected) {
    const upstream = pulls.get(entry.upstream);

    if (upstream === undefined) {
      throw new Error(`pulls.json has no upstream pull request ${entry.upstream}`);
    }

    const fixCommit = entry.fix === null ? undefined : fixCommits.get(entry.fix);

    prepared.push(
      await prepareCase({
        entry,
        upstream,
        clone: options.clone,
        work: options.work,
        split: options.split,
        fixCommit,
      }),
    );
    console.error(`prepared ${entry.id} (${prepared.length} of ${selected.length})`);
  }

  return prepared;
}
