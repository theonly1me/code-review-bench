import { z } from "zod";
import { judgeNames } from "./judges";
import { type Label, judgmentSchema, labels } from "./prompt";

export const judgeAnswerSchema = z.object({
  judge: z.enum(judgeNames),
  output: judgmentSchema.nullable(),
  error: z.string().nullable(),
});

type JudgeAnswer = z.infer<typeof judgeAnswerSchema>;

export type FinalLabel = Label | "disputed";

export function finalLabels(options: {
  readonly findingIds: readonly string[];
  readonly answers: readonly JudgeAnswer[];
  readonly tiebreaks: ReadonlyMap<string, string>;
}): ReadonlyMap<string, FinalLabel> {
  const byJudge = options.answers.map(
    (answer) =>
      new Map((answer.output?.findings ?? []).map((finding) => [finding.id, finding.label])),
  );
  const [first, second] = byJudge;

  return new Map(
    options.findingIds.map((id) => {
      const one = first?.get(id);
      const two = second?.get(id);
      const tiebreak = labels.find((label) => label === options.tiebreaks.get(id));

      return [id, one !== undefined && one === two ? one : (tiebreak ?? "disputed")];
    }),
  );
}

export function agreedDetections(
  answers: readonly JudgeAnswer[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const byJudge = answers.map((answer) => {
    const detections = new Map<string, Set<string>>();

    for (const entry of answer.output?.detected ?? []) {
      for (const findingId of entry.findings) {
        detections.set(findingId, new Set([...(detections.get(findingId) ?? []), entry.defect]));
      }
    }

    return detections;
  });
  const [first, second] = byJudge;
  const agreed = new Map<string, ReadonlySet<string>>();

  for (const [findingId, defects] of first ?? []) {
    const shared = [...defects].filter((defect) => second?.get(findingId)?.has(defect) === true);

    if (shared.length > 0) {
      agreed.set(findingId, new Set(shared));
    }
  }

  return agreed;
}

function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

export function bootstrapInterval(options: {
  readonly cases: readonly { readonly numerator: number; readonly denominator: number }[];
  readonly seed: number;
}): readonly [number, number] | null {
  const random = seededRandom(options.seed);
  const rates: number[] = [];

  for (let sample = 0; sample < 10_000; sample += 1) {
    let numerator = 0;
    let denominator = 0;

    for (let draw = 0; draw < options.cases.length; draw += 1) {
      const picked = options.cases[Math.floor(random() * options.cases.length)];
      numerator += picked?.numerator ?? 0;
      denominator += picked?.denominator ?? 0;
    }

    if (denominator > 0) {
      rates.push(numerator / denominator);
    }
  }

  rates.sort((left, right) => left - right);
  const low = rates[Math.floor(rates.length * 0.025)];
  const high = rates[Math.floor(rates.length * 0.975)];

  return low === undefined || high === undefined ? null : [low, high];
}
