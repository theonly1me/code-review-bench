import type { JudgedCase } from "./judge";
import { finalLabels } from "./labels";

export type Dispute = {
  readonly caseId: string;
  readonly id: string;
  readonly location: string;
  readonly text: string;
  readonly opinions: readonly { readonly label: string; readonly reason: string }[];
};

export function disputes(options: {
  readonly judged: readonly JudgedCase[];
  readonly tiebreaks: ReadonlyMap<string, string>;
}): readonly Dispute[] {
  return options.judged.flatMap((entry) => {
    const labels = finalLabels({
      findingIds: entry.findings.map((finding) => finding.id),
      answers: entry.answers,
      tiebreaks: options.tiebreaks,
    });

    return entry.findings
      .filter((finding) => labels.get(finding.id) === "disputed")
      .map((finding) => ({
        caseId: entry.caseId,
        id: finding.id,
        location: `${finding.path}:${finding.line ?? "?"}`,
        text: finding.text,
        opinions: entry.answers.flatMap((answer) =>
          (answer.output?.findings ?? [])
            .filter((labelled) => labelled.id === finding.id)
            .map(({ label, reason }) => ({ label, reason })),
        ),
      }));
  });
}

export function disputesMarkdown(list: readonly Dispute[]): string {
  const sections = list.map((dispute) =>
    [
      `## ${dispute.id} (${dispute.caseId}, ${dispute.location})`,
      "",
      dispute.text,
      "",
      ...dispute.opinions.map((opinion) => `- ${opinion.label}: ${opinion.reason}`),
    ].join("\n"),
  );

  return [
    "# Disputed findings",
    "",
    `${list.length} findings have no agreed label. Decide each one without the reviewer name, and write it to tiebreaks.json as { "<id>": "real" | "minor" | "wrong" }.`,
    "",
    ...sections,
  ].join("\n");
}
