import { expect, test } from "bun:test";
import type { ArmRun } from "../arms";
import type { ReviewCase } from "../cases/schema";
import type { JudgedCase } from "./judge";
import { armMetrics } from "./metrics";

const defect = (id: string) => ({
  id,
  summary: `defect ${id}`,
  fix: "",
  severity: null,
  locations: [],
});

const entry: ReviewCase = {
  id: "case-one",
  suite: "planted",
  split: "dev",
  title: "t",
  description: "",
  checkout: "/nowhere",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  changesWorkflows: false,
  defects: [defect("d1"), defect("d2")],
  pull: null,
};

const run = (repeat: number): ArmRun => ({
  arm: "shadowclone",
  caseId: "case-one",
  repeat,
  startedAt: "2026-10-10T00:00:00.000Z",
  finishedAt: "2026-10-10T00:01:00.000Z",
  status: "done",
  detail: "",
  costUsd: 1,
  raw: null,
});

const finding = (options: { readonly id: string; readonly repeat: number }) => ({
  id: options.id,
  arm: "shadowclone" as const,
  repeat: options.repeat,
  path: "a.ts",
  line: 1,
  text: "x",
});

const answer = (options: {
  readonly judge: "opus" | "sol";
  readonly detected: { readonly defect: string; readonly findings: string[] }[];
}) => ({
  judge: options.judge,
  output: {
    findings: ["F1", "F2", "F3"].map((id) => ({ id, label: "real" as const, reason: "" })),
    detected: options.detected,
  },
  error: null,
});

test("a defect counts once per review, and only when both judges name the same finding for it", () => {
  const judged: JudgedCase = {
    caseId: "case-one",
    findings: [
      finding({ id: "F1", repeat: 1 }),
      finding({ id: "F2", repeat: 1 }),
      finding({ id: "F3", repeat: 2 }),
    ],
    answers: [
      answer({
        judge: "opus",
        detected: [
          { defect: "d1", findings: ["F1", "F2"] },
          { defect: "d2", findings: ["F3"] },
        ],
      }),
      answer({ judge: "sol", detected: [{ defect: "d1", findings: ["F1", "F2"] }] }),
    ],
  };

  const metrics = armMetrics({
    arm: "shadowclone",
    cases: [entry],
    runs: [run(1), run(2)],
    judged: [judged],
    tiebreaks: new Map(),
    seed: 1,
  });

  expect(metrics.defectChances).toBe(4);
  expect(metrics.defectsFound).toBe(1);
  expect(metrics.recall).toBe(0.25);
});

test("a label counts only when both judges agree, and a disagreement stays disputed until a tiebreak", () => {
  const judged: JudgedCase = {
    caseId: "case-one",
    findings: [finding({ id: "F1", repeat: 1 }), finding({ id: "F2", repeat: 1 })],
    answers: [
      {
        judge: "opus",
        output: {
          findings: [
            { id: "F1", label: "real", reason: "" },
            { id: "F2", label: "wrong", reason: "" },
          ],
          detected: [],
        },
        error: null,
      },
      {
        judge: "sol",
        output: {
          findings: [
            { id: "F1", label: "real", reason: "" },
            { id: "F2", label: "minor", reason: "" },
          ],
          detected: [],
        },
        error: null,
      },
    ],
  };
  const options = {
    arm: "shadowclone" as const,
    cases: [entry],
    runs: [run(1)],
    judged: [judged],
    seed: 1,
  };

  expect(armMetrics({ ...options, tiebreaks: new Map() })).toMatchObject({
    real: 1,
    wrong: 0,
    disputed: 1,
  });
  expect(armMetrics({ ...options, tiebreaks: new Map([["F2", "wrong"]]) })).toMatchObject({
    real: 1,
    wrong: 1,
    disputed: 0,
  });
});
