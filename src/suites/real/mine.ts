import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJsonFile } from "../../process";
import { blamedPulls } from "./blame";
import { mergedPulls, upstreamPullSchema, type UpstreamPull } from "./pulls";
import { type CleanCase, type DefectCase, isFix, isReviewable, pickIntroducing } from "./select";

export const minedWindowSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  since: z.string(),
  until: z.string(),
  introducedBefore: z.string(),
  fixWithinDays: z.number().int().positive(),
});

export type MinedWindow = z.infer<typeof minedWindowSchema>;

export function readPulls(mined: string): readonly UpstreamPull[] {
  return z.array(upstreamPullSchema).parse(readJsonFile(path.join(mined, "pulls.json")));
}

export async function mineDefects(options: {
  readonly window: MinedWindow;
  readonly clone: string;
  readonly mined: string;
}): Promise<void> {
  const { window, clone, mined } = options;
  const pullsFile = path.join(mined, "pulls.json");

  mkdirSync(mined, { recursive: true });

  const pulls = existsSync(pullsFile)
    ? readPulls(mined)
    : await mergedPulls({
        repository: window.repository,
        since: window.since,
        until: window.until,
      });

  writeFileSync(pullsFile, JSON.stringify(pulls));

  const byNumber = new Map(pulls.map((pull) => [pull.number, pull]));
  const defects: DefectCase[] = [];

  for (const fix of pulls.filter(isFix).filter((pull) => pull.merge_commit_sha !== null)) {
    const blamed = await blamedPulls({ clone, fixCommit: fix.merge_commit_sha ?? "" });
    const picked = pickIntroducing({
      fix,
      blamed,
      pulls: byNumber,
      introducedBefore: window.introducedBefore,
      fixWithinDays: window.fixWithinDays,
    });

    if (picked !== null && !defects.some((entry) => entry.introducing === picked.introducing)) {
      defects.push(picked);
    }
  }

  const defective = new Set(defects.map((entry) => entry.introducing));
  const clean: CleanCase[] = pulls
    .filter(
      (pull) =>
        isReviewable(pull) &&
        (pull.merged_at ?? "") < window.introducedBefore &&
        !defective.has(pull.number) &&
        !isFix(pull),
    )
    .map((pull) => ({ kind: "clean", introducing: pull.number }));

  writeFileSync(
    path.join(mined, "cases.json"),
    JSON.stringify({ ...window, defects, clean }, null, 2),
  );
  console.log(
    `${pulls.length} merged pulls, ${defects.length} defect cases, ${clean.length} clean candidates`,
  );
}
