import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  borrowedRepository,
  caseCheckout,
  changesWorkflows,
  pointCaseBranches,
} from "../cases/repository";
import { defectSchema, type ReviewCase } from "../cases/schema";
import { readJsonFile } from "../process";

const plantedManifestSchema = z.object({
  repository: z.string().min(1),
  cases: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
      baseSha: z.string().regex(/^[a-f0-9]{40}$/),
      headSha: z.string().regex(/^[a-f0-9]{40}$/),
      title: z.string().max(1_000),
      description: z.string().max(65_536),
      defects: z.array(defectSchema),
    }),
  ),
});

export function manifestSeal(manifest: string): string {
  return new Bun.CryptoHasher("sha256").update(readFileSync(manifest)).digest("hex");
}

export async function buildPlantedCases(options: {
  readonly manifest: string;
  readonly work: string;
}): Promise<readonly ReviewCase[]> {
  const manifest = plantedManifestSchema.parse(readJsonFile(options.manifest));
  const cases: ReviewCase[] = [];

  for (const entry of manifest.cases) {
    const id = `planted-${entry.id}`;
    const checkout = caseCheckout({ work: options.work, caseId: id });

    await borrowedRepository({ checkout, objectsFrom: manifest.repository });
    await pointCaseBranches({ checkout, baseSha: entry.baseSha, headSha: entry.headSha });
    cases.push({
      id,
      suite: "planted",
      split: "scored",
      title: entry.title,
      description: entry.description,
      checkout,
      baseSha: entry.baseSha,
      headSha: entry.headSha,
      changesWorkflows: await changesWorkflows({
        checkout,
        baseSha: entry.baseSha,
        headSha: entry.headSha,
      }),
      defects: entry.defects,
      pull: null,
    });
  }

  return cases;
}
