import { z } from "zod";
import { askClaude, askCodex } from "./engines";

export const judgeNames = ["opus", "sol"] as const;

export type JudgeName = (typeof judgeNames)[number];

export type JudgeAnswer<Output> = {
  readonly judge: JudgeName;
  readonly output: Output | null;
  readonly error: string | null;
};

async function ask<Output>(options: {
  readonly judge: JudgeName;
  readonly prompt: string;
  readonly schema: z.ZodType<Output>;
  readonly cwd: string;
}): Promise<JudgeAnswer<Output>> {
  const request = {
    prompt: options.prompt,
    cwd: options.cwd,
    outputSchema: z.toJSONSchema(options.schema, { target: "draft-7" }),
  };

  try {
    const answer =
      options.judge === "opus"
        ? await askClaude({ ...request, model: "claude-opus-5-5" })
        : await askCodex({ ...request, model: "gpt-6.1-sol" });

    return { judge: options.judge, output: options.schema.parse(answer), error: null };
  } catch (error) {
    return {
      judge: options.judge,
      output: null,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    };
  }
}

export function askJudges<Output>(options: {
  readonly prompt: string;
  readonly schema: z.ZodType<Output>;
  readonly cwd: string;
}): Promise<readonly JudgeAnswer<Output>[]> {
  return Promise.all(judgeNames.map((judge) => ask({ ...options, judge })));
}
