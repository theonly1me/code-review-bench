import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../runProcess";
import { armNames } from "../arms";
import { type ShadowcloneCommand, shadowcloneCommand } from "../arms/shadowcloneCommand";
import { plannedReviews, runReviews } from "../arms/index";
import { casesFile, readCases, splitNames, suiteNames } from "../cases/schema";
import {
  type Arguments,
  approved,
  choice,
  listOption,
  numberOption,
  optional,
  required,
  workDirectory,
} from "../options";
import { git } from "../process";
import { openqodexRelease } from "../suites/openqodex";

const defaultModel = "claude-opus-5-5";

const reviewLinterNames = ["shellcheck", "hadolint", "actionlint", "zizmor", "squawk", "trivy"] as const;

async function versionLine(command: readonly string[]): Promise<string> {
  const result = await runProcess({
    arguments: command,
    cwd: process.cwd(),
    environment: process.env,
    timeoutMilliseconds: 30_000,
  }).catch(() => null);

  return result === null || result.exitCode !== 0
    ? "unknown"
    : (result.stdout.trim().split("\n")[0] ?? "unknown");
}

async function shadowcloneVersion(command: ShadowcloneCommand): Promise<string> {
  return command.checkout === null
    ? versionLine([...command.arguments, "--version"])
    : git({ cwd: command.checkout, arguments: ["rev-parse", "HEAD"] });
}

export async function runManifest(options: {
  readonly model: string;
  readonly shadowclone: ShadowcloneCommand;
}) {
  return {
    harnessCommit: await git({ cwd: import.meta.dir, arguments: ["rev-parse", "HEAD"] }),
    shadowclone: await shadowcloneVersion(options.shadowclone),
    shadowcloneDirty:
      options.shadowclone.checkout !== null &&
      (await git({
        cwd: options.shadowclone.checkout,
        arguments: ["status", "--porcelain", "--", "packages", "skills"],
      })) !== "",
    openqodex: openqodexRelease,
    claudeCode: await versionLine(["claude", "--version"]),
    node: await versionLine(["node", "--version"]),
    linters: reviewLinterNames.filter((linter) => Bun.which(linter) !== null),
    model: options.model,
    machine: `${os.platform()} ${os.arch()} ${os.cpus()[0]?.model ?? ""}`.trim(),
    startedAt: new Date().toISOString(),
  };
}

export async function runCommand(argv: Arguments): Promise<void> {
  const work = await workDirectory(argv);
  const suite = choice({ argv, name: "--suite", choices: suiteNames });
  const split = choice({ argv, name: "--split", choices: splitNames });
  const arm = choice({ argv, name: "--arm", choices: armNames });
  const runs = path.join(work, "runs", required({ argv, name: "--run" }));
  const only = listOption({ argv, name: "--only" });
  const model = optional({ argv, name: "--model" }) ?? defaultModel;
  const shadowclone = shadowcloneCommand(optional({ argv, name: "--shadowclone" }));
  const cases = readCases(casesFile({ work, suite, split })).filter(
    (entry) => only === undefined || only.includes(entry.id),
  );
  const planned = plannedReviews({
    arm,
    cases,
    runs,
    repeats: numberOption({ argv, name: "--repeats", fallback: 1 }),
  });
  const host = arm === "greptile" ? "Greptile" : "Claude Code";

  if (cases.length === 0) {
    throw new Error(
      `No ${suite} ${split} cases in ${work}. Build them with the cases command first.`,
    );
  }

  if (
    !approved({
      argv,
      plan: {
        calls: planned.length,
        host,
        model: arm === "greptile" ? "its own models" : model,
        what: `${arm} reviews`,
      },
    })
  ) {
    return;
  }

  mkdirSync(runs, { recursive: true });
  writeFileSync(
    path.join(runs, `manifest-${arm}-${Date.now()}.json`),
    JSON.stringify(await runManifest({ model, shadowclone }), null, 2),
  );

  const results = await runReviews({
    arm,
    planned,
    settings: {
      model,
      shadowclone,
      openqodexTimeoutSeconds: numberOption({ argv, name: "--openqodex-timeout", fallback: 900 }),
    },
    limit: numberOption({ argv, name: "--limit", fallback: 3 }),
  });

  console.log(
    `${arm}: ${results.filter((run) => run.status === "done").length} of ${results.length} reviews done`,
  );
}
