import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJsonFile } from "../../process";
import { readPulls } from "./mine";
import { validatedSchema } from "./validate";

export const selectedCaseSchema = z.object({
  id: z.string().regex(/^c\d{2}$/),
  kind: z.enum(["defect", "clean"]),
  upstream: z.number(),
  title: z.string(),
  fix: z.number().nullable(),
  defect: z.string().nullable(),
});

export type SelectedCase = z.infer<typeof selectedCaseSchema>;

export function seededShuffle<Item>(options: {
  readonly items: readonly Item[];
  readonly seed: number;
}): readonly Item[] {
  const shuffled = [...options.items];
  let state = options.seed;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const swap = state % (index + 1);
    const current = shuffled[index];
    const other = shuffled[swap];

    if (current !== undefined && other !== undefined) {
      shuffled[index] = other;
      shuffled[swap] = current;
    }
  }

  return shuffled;
}

export function selectRealCases(options: {
  readonly mined: string;
  readonly clean: number;
  readonly seed: number;
}): readonly SelectedCase[] {
  const selectedFile = path.join(options.mined, "selected.json");

  if (existsSync(selectedFile)) {
    return z.array(selectedCaseSchema).parse(readJsonFile(selectedFile));
  }

  const pulls = new Map(readPulls(options.mined).map((pull) => [pull.number, pull]));
  const validated = z
    .array(validatedSchema)
    .parse(readJsonFile(path.join(options.mined, "validated.json")))
    .filter((entry) => entry.valid);
  const cleanPool = z
    .object({ clean: z.array(z.object({ introducing: z.number() })) })
    .parse(readJsonFile(path.join(options.mined, "cases.json"))).clean;
  const defects = validated.map((entry) => ({
    kind: "defect" as const,
    upstream: entry.introducing,
    fix: entry.fix,
    defect: entry.verdicts[0]?.output?.defect ?? null,
  }));
  const clean = seededShuffle({ items: cleanPool, seed: options.seed })
    .slice(0, options.clean)
    .map((entry) => ({
      kind: "clean" as const,
      upstream: entry.introducing,
      fix: null,
      defect: null,
    }));
  const ordered = seededShuffle({ items: [...defects, ...clean], seed: options.seed + 1 });
  const selected = ordered.map((entry, index) => ({
    ...entry,
    id: `c${String(index + 1).padStart(2, "0")}`,
    title: pulls.get(entry.upstream)?.title ?? "",
  }));

  writeFileSync(selectedFile, JSON.stringify(selected, null, 2));
  return selected;
}
