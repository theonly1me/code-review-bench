import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { runProcess } from "../runProcess";

const baseKeys = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TZ",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
] as const;

const claudeKeys = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
] as const;

const codexKeys = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;

const judgeTools = ["Read", "Grep", "Glob"] as const;

const judgeTimeoutMilliseconds = 30 * 60_000;

const claudeResultSchema = z.object({
  type: z.literal("result"),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
});

export type JudgeRequest = {
  readonly prompt: string;
  readonly cwd: string;
  readonly model: string;
  readonly outputSchema: unknown;
};

function engineEnvironment(keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        (baseKeys.some((key) => key === entry[0]) || keys.includes(entry[0])),
    ),
  );
}

export function claudeAnswer(stdout: string): z.infer<typeof claudeResultSchema> {
  const parsed: unknown = JSON.parse(stdout);
  const messages = z.array(z.unknown()).safeParse(parsed).data ?? [parsed];
  const answer = messages
    .map((message) => claudeResultSchema.safeParse(message).data)
    .findLast((result) => result !== undefined);

  if (answer === undefined) {
    throw new Error("Claude Code returned no result message");
  }

  return answer;
}

function failure(options: { readonly engine: string; readonly text: string }): Error {
  return new Error(`${options.engine} failed: ${options.text.trim().slice(-300)}`);
}

export async function askClaude(request: JudgeRequest): Promise<unknown> {
  const settings = JSON.stringify({
    disableAllHooks: true,
    autoMemoryEnabled: false,
    permissions: {
      allow: judgeTools,
      deny: ["Bash", "Edit", "Write", "NotebookEdit", "mcp__*", "WebFetch", "WebSearch"],
    },
  });
  const result = await runProcess({
    arguments: [
      "claude",
      "-p",
      "--output-format",
      "json",
      "--setting-sources",
      "",
      "--safe-mode",
      "--restricted",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--tools",
      judgeTools.join(","),
      "--disallowedTools",
      "mcp__*",
      "--settings",
      settings,
      "--model",
      request.model,
      "--effort",
      "high",
      "--permission-mode",
      "dontAsk",
      "--json-schema",
      JSON.stringify(request.outputSchema),
      "--allowedTools",
      ...judgeTools,
    ],
    cwd: request.cwd,
    environment: engineEnvironment(claudeKeys),
    input: request.prompt,
    timeoutMilliseconds: judgeTimeoutMilliseconds,
  });

  if (result.exitCode !== 0) {
    throw failure({ engine: "Claude Code", text: result.stderr || result.stdout });
  }

  const answer = claudeAnswer(result.stdout);

  if (answer.is_error === true) {
    throw failure({ engine: "Claude Code", text: answer.result ?? "" });
  }

  return answer.structured_output ?? JSON.parse(answer.result ?? "");
}

export async function askCodex(request: JudgeRequest): Promise<unknown> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "review-judge-"));
  const schemaFile = path.join(directory, "schema.json");
  const answerFile = path.join(directory, "answer.json");

  await writeFile(schemaFile, JSON.stringify(request.outputSchema));

  try {
    const result = await runProcess({
      arguments: [
        "codex",
        "exec",
        "-",
        "-C",
        request.cwd,
        "--skip-git-repo-check",
        "-c",
        'approval_policy="never"',
        "-c",
        "mcp_servers={}",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "-c",
        "features.memories=false",
        "-c",
        "features.hooks=false",
        "-c",
        "project_doc_max_bytes=0",
        "-c",
        'web_search="disabled"',
        "--model",
        request.model,
        "-c",
        'model_reasoning_effort="high"',
        "--output-schema",
        schemaFile,
        "--output-last-message",
        answerFile,
      ],
      cwd: request.cwd,
      environment: engineEnvironment(codexKeys),
      input: request.prompt,
      timeoutMilliseconds: judgeTimeoutMilliseconds,
    });

    if (result.exitCode !== 0) {
      throw failure({ engine: "Codex", text: result.stderr || result.stdout });
    }

    return JSON.parse(await readFile(answerFile, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
