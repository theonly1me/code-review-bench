import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ArmRun } from "../arms";
import type { ReviewCase } from "../cases/schema";
import { writeTheirLayout } from "./openqodexScore";

const theirCategories = ["bug", "security", "performance", "maintainability", "style"];

const categories = ["correctness", "security", "performance", "standards", "tests"] as const;

const finding = (category: string) => ({
  path: "orders/models.py",
  line: 20,
  severity: "high",
  category,
  source: "investigation",
  title: "Decimal times float",
  explanation: "self.total * 0.9 raises TypeError.",
  failureScenario: "Every redemption fails.",
  evidence: [{ source: "code", location: "orders/models.py:20", quote: "self.total * 0.9" }],
  rule: null,
  suggestion: "Use Decimal.",
  refutation: "None.",
  candidates: [],
});

const result = {
  version: 1,
  pull: {
    repository: "local/repo",
    number: null,
    title: "t",
    body: "",
    baseRefName: "main",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
  },
  model: "claude-opus-5-5",
  findings: categories.map(finding),
  commentableLines: {},
  skippedPaths: [],
  toolchain: [],
  dropped: [],
  candidates: { dropped: [], undecided: [] },
  rejections: [],
  statistics: {
    modelFindings: 5,
    droppedForEvidence: 0,
    correctionRound: "none",
    certainRuleHits: 0,
    signalRuleHits: 0,
    durationMilliseconds: 1,
    costUsd: null,
  },
};

const entry: ReviewCase = {
  id: "openqodex-django-model-view",
  suite: "openqodex",
  split: "scored",
  title: "Apply the change",
  description: "",
  checkout: "/nowhere",
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  changesWorkflows: false,
  defects: [],
  openqodexSpec: { id: "django-model-view", clean: false, bugs: [] },
  pull: null,
};

const run: ArmRun = {
  arm: "shadowclone",
  caseId: entry.id,
  repeat: 2,
  startedAt: "2026-10-10T00:00:00.000Z",
  finishedAt: "2026-10-10T00:00:30.000Z",
  status: "done",
  detail: "",
  costUsd: null,
  raw: result,
};

test("every Shadowclone finding reaches their scorer with one of their categories, at its own place and words", () => {
  const folder = path.join(mkdtempSync(path.join(os.tmpdir(), "their-layout-")), "run");

  try {
    expect(
      writeTheirLayout({ folder, cases: [entry], runs: [run], model: "claude-opus-5-5" }),
    ).toBe(1);

    const report = JSON.parse(
      readFileSync(
        path.join(
          folder,
          "samples",
          "django-model-view",
          "shadowclone",
          "2",
          "report",
          "report.json",
        ),
        "utf8",
      ),
    );

    expect(report.completion.status).toBe("complete");
    expect(
      report.findings.map((written: { category: string }) =>
        theirCategories.includes(written.category),
      ),
    ).toEqual(categories.map(() => true));
    expect(report.findings[0]).toMatchObject({
      file_path: "orders/models.py",
      line_number: 20,
      category: "bug",
      problem: "self.total * 0.9 raises TypeError.",
    });
    expect(
      JSON.parse(
        readFileSync(
          path.join(folder, "samples", "django-model-view", "shadowclone", "2", "sample.json"),
          "utf8",
        ),
      ).wallMs,
    ).toBe(30_000);
  } finally {
    rmSync(path.dirname(folder), { recursive: true, force: true });
  }
});
