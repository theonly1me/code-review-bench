import { casesCommand, copyCommand, mineCommand, validateCommand } from "./commands/cases";
import { disputesCommand, judgeCommand, reportCommand } from "./commands/grade";
import { runCommand } from "./commands/run";
import type { Arguments } from "./options";

const commands: Readonly<Record<string, (argv: Arguments) => Promise<void>>> = {
  mine: mineCommand,
  validate: validateCommand,
  cases: casesCommand,
  copy: copyCommand,
  run: runCommand,
  judge: judgeCommand,
  report: reportCommand,
  disputes: disputesCommand,
};

const [name = "", ...argv] = process.argv.slice(2);
const command = commands[name];

if (command === undefined) {
  throw new Error(
    `Use bun src/cli.ts ${Object.keys(commands).join("|")} with their options. See README.md.`,
  );
}

await command(argv);
