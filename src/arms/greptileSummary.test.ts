import { expect, test } from "bun:test";
import { greptileSummaryWithoutFindings } from "./greptileSummary";

const startedAt = "2026-10-10T22:28:48.164Z";

function summary(options: { readonly id: number; readonly body: string; readonly at: string }) {
  return {
    id: options.id,
    body: options.body,
    created_at: options.at,
    user: { login: "greptile-apps[bot]" },
  };
}

const clean =
  "<!-- greptile_summary -->\n<h2>Confidence Score: 5/5</h2>\nThe PR appears safe to merge.";
const withFindings =
  "<!-- greptile_summary -->\n<h2>Confidence Score: 4/5</h2>\n<h2>Findings</h2>\n1. Blocked workers stop automatic reloads";

test("a greptile summary with no findings after the request counts as its answer", () => {
  expect(
    greptileSummaryWithoutFindings({
      issueComments: [summary({ id: 7, body: clean, at: "2026-10-10T22:32:07Z" })],
      startedAt,
    }),
  ).toEqual({ id: 7, createdAt: "2026-10-10T22:32:07Z" });
});

test("a summary that lists findings, or one from before the request, is not an answer", () => {
  expect(
    greptileSummaryWithoutFindings({
      issueComments: [
        summary({ id: 8, body: withFindings, at: "2026-10-10T22:32:07Z" }),
        summary({ id: 9, body: clean, at: "2026-10-10T21:00:00Z" }),
      ],
      startedAt,
    }),
  ).toBeNull();
});
