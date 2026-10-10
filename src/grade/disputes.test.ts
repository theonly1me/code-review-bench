import { expect, test } from "bun:test";
import { disputes, disputesMarkdown } from "./disputes";
import type { JudgedCase } from "./judge";

const finding = (id: string) => ({
  id,
  arm: "openqodex" as const,
  repeat: 1,
  path: "src/a.ts",
  line: 3,
  text: `finding ${id}`,
});

const judged: JudgedCase = {
  caseId: "case-one",
  findings: [finding("F1"), finding("F2"), finding("F3")],
  answers: [
    {
      judge: "opus",
      output: {
        findings: [
          { id: "F1", label: "real", reason: "opus agrees" },
          { id: "F2", label: "real", reason: "opus sees a crash" },
          { id: "F3", label: "wrong", reason: "opus says handled" },
        ],
        detected: [],
      },
      error: null,
    },
    {
      judge: "sol",
      output: {
        findings: [
          { id: "F1", label: "real", reason: "sol agrees" },
          { id: "F2", label: "wrong", reason: "sol finds a guard" },
          { id: "F3", label: "minor", reason: "sol says rare" },
        ],
        detected: [],
      },
      error: null,
    },
  ],
};

test("a disagreement without a tiebreak is listed blind with both reasons, and an agreed or decided finding is not", () => {
  const list = disputes({ judged: [judged], tiebreaks: new Map([["F3", "minor"]]) });
  const markdown = disputesMarkdown(list);

  expect(list.map((dispute) => dispute.id)).toEqual(["F2"]);
  expect(markdown).toContain("- real: opus sees a crash");
  expect(markdown).toContain("- wrong: sol finds a guard");
  expect(markdown).not.toContain("openqodex");
});
