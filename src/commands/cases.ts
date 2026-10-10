import path from "node:path";
import { z } from "zod";
import { casesFile, readCases, splitNames, suiteNames, writeCases } from "../cases/schema";
import { copyCases } from "../copy";
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
import { buildOpenqodexCases } from "../suites/openqodex";
import { buildPlantedCases, manifestSeal } from "../suites/planted";
import { mineDefects } from "../suites/real/mine";
import { prepareRealCases } from "../suites/real/prepare";
import { validateDefects } from "../suites/real/validate";
import { readJsonFile } from "../process";

export async function casesCommand(argv: Arguments): Promise<void> {
  const work = await workDirectory(argv);
  const suite = choice({ argv, name: "--suite", choices: suiteNames });

  if (suite === "openqodex") {
    const only = listOption({ argv, name: "--only" });
    const cases = await buildOpenqodexCases({ work, ...(only === undefined ? {} : { only }) });

    writeCases({ file: casesFile({ work, suite, split: "scored" }), cases });
    console.log(`${cases.length} openqodex cases`);
    return;
  }

  if (suite === "planted") {
    const manifest = required({ argv, name: "--manifest" });
    const cases = await buildPlantedCases({ manifest, work });

    writeCases({ file: casesFile({ work, suite, split: "scored" }), cases });
    console.log(`${cases.length} planted cases. Manifest sha256: ${manifestSeal(manifest)}`);
    return;
  }

  const split = choice({ argv, name: "--split", choices: splitNames });
  const cases = await prepareRealCases({
    mined: required({ argv, name: "--mined" }),
    clone: required({ argv, name: "--clone" }),
    work,
    split,
    clean: numberOption({ argv, name: "--clean", fallback: 12 }),
    seed: numberOption({ argv, name: "--seed", fallback: 20261010 }),
  });

  writeCases({ file: casesFile({ work, suite, split }), cases });
  console.log(
    `${cases.length} real cases in the ${split} split, ${cases.filter((entry) => entry.defects.length > 0).length} with a known defect`,
  );
}

export async function mineCommand(argv: Arguments): Promise<void> {
  await mineDefects({
    window: {
      repository: required({ argv, name: "--repo" }),
      since: required({ argv, name: "--since" }),
      until: required({ argv, name: "--until" }),
      introducedBefore: required({ argv, name: "--introduced-before" }),
      fixWithinDays: numberOption({ argv, name: "--fix-within-days", fallback: 60 }),
    },
    clone: required({ argv, name: "--clone" }),
    mined: required({ argv, name: "--mined" }),
  });
}

export async function validateCommand(argv: Arguments): Promise<void> {
  const mined = required({ argv, name: "--mined" });
  const planned = z
    .object({ defects: z.array(z.unknown()) })
    .parse(readJsonFile(path.join(mined, "cases.json"))).defects.length;

  if (
    approved({
      argv,
      plan: {
        calls: planned * 2,
        host: "Claude Code and Codex",
        model: "claude-opus-5-5 and gpt-6.1-sol",
        what: "judge calls",
      },
    })
  ) {
    await validateDefects({ mined, clone: required({ argv, name: "--clone" }) });
  }
}

export async function copyCommand(argv: Arguments): Promise<void> {
  const work = await workDirectory(argv);
  const suite = choice({ argv, name: "--suite", choices: suiteNames });
  const split = choice({ argv, name: "--split", choices: splitNames });
  const file = casesFile({ work, suite, split });
  const only = listOption({ argv, name: "--only" });
  const cases = readCases(file);
  const selected = cases.filter((entry) => only === undefined || only.includes(entry.id));
  const copied = new Map(
    (
      await copyCases({ cases: selected, evalRepository: required({ argv, name: "--eval-repo" }) })
    ).map((entry) => [entry.id, entry]),
  );

  writeCases({ file, cases: cases.map((entry) => copied.get(entry.id) ?? entry) });
  console.log(
    `${[...copied.values()].filter((entry) => entry.pull !== null).length} cases have a pull request copy${optional({ argv, name: "--only" }) === undefined ? "" : " in the selection"}`,
  );
}
