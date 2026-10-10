import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { plannedReviews } from "./arms/index";
import { pointCaseBranches, withReviewClone } from "./cases/repository";
import type { ReviewCase } from "./cases/schema";
import { copyCases } from "./copy";
import { approved } from "./options";
import { git } from "./process";

const sha = (letter: string) => letter.repeat(40);

const entry = (options: {
  readonly id: string;
  readonly checkout: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly changesWorkflows: boolean;
}): ReviewCase => ({
  ...options,
  suite: "real",
  split: "dev",
  title: "Add b",
  description: "",
  defects: [],
  pull: null,
});

function temporaryDirectory(): string {
  return mkdtempSync(path.join(os.tmpdir(), "review-harness-"));
}

test("a paid command runs only with --yes and a --max-calls ceiling that covers the plan", () => {
  const plan = { calls: 6, host: "Claude Code", model: "claude-opus-5-5", what: "reviews" };

  expect(approved({ argv: ["--max-calls", "10"], plan })).toBe(false);
  expect(() => approved({ argv: ["--yes", "--max-calls", "5"], plan })).toThrow(
    "over the --max-calls ceiling of 5",
  );
  expect(() => approved({ argv: ["--yes"], plan })).toThrow("over the --max-calls ceiling of 0");
  expect(approved({ argv: ["--yes", "--max-calls", "6"], plan })).toBe(true);
});

test("a resumed run plans only the reviews that are not done yet", () => {
  const runs = temporaryDirectory();
  const done = path.join(runs, "openqodex", "c1", "1");
  const failed = path.join(runs, "openqodex", "c1", "2");
  const base = {
    arm: "openqodex",
    caseId: "c1",
    startedAt: "2026-10-10T00:00:00.000Z",
    finishedAt: null,
    detail: "",
    costUsd: null,
    raw: null,
  };

  try {
    mkdirSync(done, { recursive: true });
    mkdirSync(failed, { recursive: true });
    writeFileSync(
      path.join(done, "run.json"),
      JSON.stringify({ ...base, repeat: 1, status: "done" }),
    );
    writeFileSync(
      path.join(failed, "run.json"),
      JSON.stringify({ ...base, repeat: 2, status: "failed" }),
    );

    const planned = plannedReviews({
      arm: "openqodex",
      cases: [
        entry({
          id: "c1",
          checkout: "/nowhere",
          baseSha: sha("a"),
          headSha: sha("b"),
          changesWorkflows: false,
        }),
      ],
      runs,
      repeats: 3,
    });

    expect(planned.map((review) => review.repeat)).toEqual([2, 3]);
  } finally {
    rmSync(runs, { recursive: true, force: true });
  }
});

test("a reviewer gets a fresh clone with main at the base, the head checked out, no remote, and the clone is removed after", async () => {
  const root = temporaryDirectory();
  const checkout = path.join(root, "repo");

  try {
    mkdirSync(checkout);
    await git({ cwd: checkout, arguments: ["init", "--quiet", "--initial-branch=main"] });
    writeFileSync(path.join(checkout, "a.txt"), "a\n");
    await git({ cwd: checkout, arguments: ["add", "a.txt"] });
    await git({
      cwd: checkout,
      arguments: [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "--quiet",
        "--message",
        "base",
      ],
    });
    const baseSha = await git({ cwd: checkout, arguments: ["rev-parse", "HEAD"] });
    writeFileSync(path.join(checkout, "b.txt"), "b\n");
    await git({ cwd: checkout, arguments: ["add", "b.txt"] });
    await git({
      cwd: checkout,
      arguments: [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "--quiet",
        "--message",
        "head",
      ],
    });
    const headSha = await git({ cwd: checkout, arguments: ["rev-parse", "HEAD"] });
    await pointCaseBranches({ checkout, baseSha, headSha });

    const seen = await withReviewClone({
      entry: entry({ id: "c1", checkout, baseSha, headSha, changesWorkflows: false }),
      work: async (clone) => ({
        clone,
        changed: await git({ cwd: clone, arguments: ["diff", "--name-only", "main...HEAD"] }),
        remotes: await git({ cwd: clone, arguments: ["remote"] }),
        branch: await git({ cwd: clone, arguments: ["branch", "--show-current"] }),
      }),
    });

    expect(seen).toMatchObject({ changed: "b.txt", remotes: "", branch: "case" });
    expect(existsSync(seen.clone)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a case whose change edits a workflow is never pushed to the evaluation repository", async () => {
  const unsafe = entry({
    id: "c2",
    checkout: "/nowhere",
    baseSha: sha("a"),
    headSha: sha("b"),
    changesWorkflows: true,
  });

  expect(await copyCases({ cases: [unsafe], evalRepository: "owner/does-not-exist" })).toEqual([
    unsafe,
  ]);
});
