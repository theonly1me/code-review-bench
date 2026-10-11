import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { armNames } from "../arms";
import { casesFile, readCases, splitNames, suiteNames } from "../cases/schema";
import { collectRuns, findingsByCase } from "../grade/collect";
import { disputes, disputesMarkdown } from "../grade/disputes";
import { judgeCases, readJudged } from "../grade/judge";
import { armMetrics } from "../grade/metrics";
import { metricsTable } from "../grade/report";
import {
  type Arguments,
  approved,
  choice,
  numberOption,
  optional,
  required,
  workDirectory,
} from "../options";
import { readJsonFile } from "../process";

async function selection(argv: Arguments) {
  const work = await workDirectory(argv);
  const suite = choice({ argv, name: "--suite", choices: suiteNames });
  const split = choice({ argv, name: "--split", choices: splitNames });
  const runs = path.join(work, "runs", required({ argv, name: "--run" }));
  const cases = readCases(casesFile({ work, suite, split }));

  return {
    work,
    suite,
    split,
    runs,
    cases,
    judgedFile: path.join(runs, `judged-${suite}-${split}.json`),
  };
}

function readTiebreaks(runs: string): ReadonlyMap<string, string> {
  const file = path.join(runs, "tiebreaks.json");

  return new Map(
    existsSync(file)
      ? Object.entries(z.record(z.string(), z.string()).parse(readJsonFile(file)))
      : [],
  );
}

export async function disputesCommand(argv: Arguments): Promise<void> {
  const { suite, split, runs, judgedFile } = await selection(argv);
  const list = disputes({ judged: readJudged(judgedFile), tiebreaks: readTiebreaks(runs) });
  const file = path.join(runs, `disputes-${suite}-${split}.md`);

  writeFileSync(file, `${disputesMarkdown(list)}\n`);
  console.log(`${list.length} disputed findings written to ${file}`);
}

export async function judgeCommand(argv: Arguments): Promise<void> {
  const { runs, cases, judgedFile } = await selection(argv);
  const findings = findingsByCase(collectRuns({ runs, cases }));
  const withFindings = cases.filter((entry) => (findings.get(entry.id)?.length ?? 0) > 0).length;

  if (
    approved({
      argv,
      plan: {
        calls: withFindings * 2,
        host: "Claude Code and Codex",
        model: "claude-opus-5-5 and gpt-6.1-sol",
        what: "judge calls (at most)",
      },
    })
  ) {
    await judgeCases({
      cases,
      findingsByCase: findings,
      output: judgedFile,
      seed: optional({ argv, name: "--seed" }) ?? "20261010",
    });
  }
}

export async function reportCommand(argv: Arguments): Promise<void> {
  const { suite, split, runs, cases, judgedFile } = await selection(argv);
  const allRuns = collectRuns({ runs, cases });
  const judged = readJudged(judgedFile);
  const tiebreaks = readTiebreaks(runs);
  const seed = numberOption({ argv, name: "--seed", fallback: 20261010 });
  const metrics = armNames
    .filter((arm) => allRuns.some((run) => run.arm === arm))
    .map((arm, index) =>
      armMetrics({ arm, cases, runs: allRuns, judged, tiebreaks, seed: seed + index * 10 }),
    );
  const report = metricsTable({ title: `${suite} ${split}: blind judges`, metrics });

  writeFileSync(path.join(runs, `report-${suite}-${split}.md`), `${report}\n`);
  writeFileSync(
    path.join(runs, `metrics-${suite}-${split}.json`),
    JSON.stringify(metrics, null, 2),
  );
  console.log(report);
}
