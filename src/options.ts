import { mkdirSync } from "node:fs";
import { requirePrivateDirectory } from "./privateDirectory";

export type Arguments = readonly string[];

export function optional(options: {
  readonly argv: Arguments;
  readonly name: string;
}): string | undefined {
  const index = options.argv.indexOf(options.name);

  return index < 0 ? undefined : options.argv[index + 1];
}

export function required(options: { readonly argv: Arguments; readonly name: string }): string {
  const value = optional(options);

  if (value === undefined) {
    throw new Error(`Missing ${options.name}`);
  }

  return value;
}

export function listOption(options: {
  readonly argv: Arguments;
  readonly name: string;
}): readonly string[] | undefined {
  return optional(options)
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

export function numberOption(options: {
  readonly argv: Arguments;
  readonly name: string;
  readonly fallback: number;
}): number {
  const value = optional(options);
  const parsed = value === undefined ? options.fallback : Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${options.name} needs a number that is 0 or more`);
  }

  return parsed;
}

export function choice<Choice extends string>(options: {
  readonly argv: Arguments;
  readonly name: string;
  readonly choices: readonly Choice[];
}): Choice {
  const value = required(options);
  const match = options.choices.find((candidate) => candidate === value);

  if (match === undefined) {
    throw new Error(`${options.name} must be one of ${options.choices.join(", ")}`);
  }

  return match;
}

export async function workDirectory(argv: Arguments): Promise<string> {
  const work = required({ argv, name: "--work" });

  mkdirSync(work, { recursive: true, mode: 0o700 });
  return requirePrivateDirectory(work);
}

export type ApprovalPlan = {
  readonly calls: number;
  readonly host: string;
  readonly model: string;
  readonly what: string;
};

export function approved(options: {
  readonly argv: Arguments;
  readonly plan: ApprovalPlan;
}): boolean {
  const { plan } = options;

  console.error(`Plan: ${plan.calls} ${plan.what} with ${plan.host} (${plan.model}).`);

  if (!options.argv.includes("--yes")) {
    console.error("Dry run. Add --yes and --max-calls <n> to run it.");
    return false;
  }

  const ceiling = numberOption({ argv: options.argv, name: "--max-calls", fallback: 0 });

  if (ceiling < plan.calls) {
    throw new Error(
      `The plan needs ${plan.calls} calls, over the --max-calls ceiling of ${ceiling}`,
    );
  }

  return true;
}
