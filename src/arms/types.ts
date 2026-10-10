import { z } from "zod";
import type { ReviewCase } from "../cases/schema";
import type { ShadowcloneCommand } from "./shadowcloneCommand";

export const localArmNames = ["shadowclone", "openqodex"] as const;

export const cloudArmNames = ["shadowclone-cloud", "greptile"] as const;

export const armNames = [...localArmNames, ...cloudArmNames] as const;

export type ArmName = (typeof armNames)[number];

export type LocalArmName = (typeof localArmNames)[number];

export type CloudArmName = (typeof cloudArmNames)[number];

export const armRunSchema = z.object({
  arm: z.enum(armNames),
  caseId: z.string(),
  repeat: z.number().int().positive(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["done", "timed-out", "failed", "skipped"]),
  detail: z.string(),
  costUsd: z.number().nullable(),
  raw: z.unknown(),
});

export type ArmRun = z.infer<typeof armRunSchema>;

export type ArmSettings = {
  readonly model: string;
  readonly openqodexTimeoutSeconds: number;
  readonly shadowclone: ShadowcloneCommand;
};

export type ArmRunner = (options: {
  readonly entry: ReviewCase;
  readonly repeat: number;
  readonly directory: string;
  readonly settings: ArmSettings;
}) => Promise<ArmRun>;

export type Finding = {
  readonly arm: ArmName;
  readonly caseId: string;
  readonly repeat: number;
  readonly path: string;
  readonly line: number | null;
  readonly title: string;
  readonly text: string;
  readonly category: string | null;
  readonly severity: string | null;
};

export function failedRun(options: {
  readonly arm: ArmName;
  readonly entry: ReviewCase;
  readonly repeat: number;
  readonly startedAt: string;
  readonly error: unknown;
}): ArmRun {
  const message = options.error instanceof Error ? options.error.message : String(options.error);

  return {
    arm: options.arm,
    caseId: options.entry.id,
    repeat: options.repeat,
    startedAt: options.startedAt,
    finishedAt: null,
    status: "failed",
    detail: message.slice(0, 400),
    costUsd: null,
    raw: null,
  };
}
