import { z } from "zod";
import type { Defect } from "../cases/schema";

export const labels = ["real", "minor", "wrong"] as const;

export type Label = (typeof labels)[number];

export const judgmentSchema = z.object({
  findings: z.array(
    z.object({ id: z.string(), label: z.enum(labels), reason: z.string().max(600) }),
  ),
  detected: z.array(z.object({ defect: z.string(), findings: z.array(z.string()) })),
});

export type Judgment = z.infer<typeof judgmentSchema>;

export type BlindFinding = {
  readonly id: string;
  readonly path: string;
  readonly line: number | null;
  readonly text: string;
};

const maximumFixLength = 30_000;

function knownDefects(defects: readonly Defect[]): string {
  if (defects.length === 0) {
    return "This change has no known defect. Leave detected empty.";
  }

  const listed = defects.map((defect) =>
    [
      `<known_defect id="${defect.id}">`,
      defect.summary,
      defect.locations.length === 0
        ? ""
        : `Locations: ${defect.locations.map((location) => `${location.path}:${location.lines[0]}-${location.lines[1]}`).join(", ")}`,
      defect.fix === "" ? "" : `<fix>\n${defect.fix.slice(0, maximumFixLength)}\n</fix>`,
      "</known_defect>",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );

  return `This change has known defects:
${listed.join("\n")}
For each known defect, list in detected the ids of the findings that identify that same defect, even in other words. A finding that only touches the same file or line does not count. Leave out a defect that no finding identifies.`;
}

export function judgePrompt(options: {
  readonly title: string;
  readonly diff: string;
  readonly findings: readonly BlindFinding[];
  readonly defects: readonly Defect[];
}): string {
  return `You judge findings from automated reviews of one change. The working directory is the head of the change. Read the code before you decide.

Label each finding:
- real: the change introduces the problem, and it causes a concrete failure, a security risk, or breaks a rule that the repository writes down.
- minor: the claim is true, but the impact is small, such as style, naming, or a rare case with little effect.
- wrong: the claim is false, the problem existed before the change, other code already handles it, or the finding cites code that is not there.

Judge each finding on its own. The findings come from several reviewers and several runs, in random order. Two findings can say the same thing.
${knownDefects(options.defects)}

<change_title>${options.title}</change_title>
<findings>
${JSON.stringify(options.findings, null, 1)}
</findings>
<diff>
${options.diff}
</diff>`;
}
