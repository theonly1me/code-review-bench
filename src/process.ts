import { readFileSync } from "node:fs";
import { runProcess } from "./runProcess";

export async function git(options: {
  readonly cwd: string;
  readonly arguments: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}): Promise<string> {
  const result = await runProcess({
    arguments: ["git", ...options.arguments],
    cwd: options.cwd,
    environment: { ...process.env, ...options.environment },
    timeoutMilliseconds: 600_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `git ${options.arguments[0] ?? ""} failed: ${result.stderr.trim().slice(0, 300)}`,
    );
  }

  return result.stdout.trim();
}

export async function ghJson(arguments_: readonly string[]): Promise<unknown> {
  const result = await runProcess({
    arguments: ["gh", ...arguments_],
    cwd: process.cwd(),
    environment: process.env,
    timeoutMilliseconds: 120_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `gh ${arguments_.slice(0, 3).join(" ")} failed: ${result.stderr.trim().slice(0, 300)}`,
    );
  }

  return JSON.parse(result.stdout);
}

export async function inParallel<Input, Output>(options: {
  readonly items: readonly Input[];
  readonly limit: number;
  readonly work: (item: Input) => Promise<Output>;
}): Promise<readonly Output[]> {
  const results: Output[] = [];
  const queue = options.items.map((item, index) => ({ item, index }));
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      results[next.index] = await options.work(next.item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(options.limit, queue.length)) }, worker),
  );
  return results;
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}
