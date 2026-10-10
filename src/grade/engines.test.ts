import { expect, test } from "bun:test";
import { claudeAnswer } from "./engines";

const structured = { labels: [{ id: "F1", label: "real" }] };

test("the Claude judge reads the result message when Claude Code prints every message as an array", () => {
  const stdout = JSON.stringify([
    { type: "system", subtype: "init" },
    { type: "assistant", message: { content: [] } },
    { type: "result", is_error: false, result: "", structured_output: structured },
  ]);

  expect(claudeAnswer(stdout).structured_output).toEqual(structured);
});

test("the Claude judge reads a single result object", () => {
  const stdout = JSON.stringify({ type: "result", is_error: false, structured_output: structured });

  expect(claudeAnswer(stdout).structured_output).toEqual(structured);
});

test("the Claude judge fails when Claude Code prints no result message", () => {
  expect(() => claudeAnswer(JSON.stringify([{ type: "system" }]))).toThrow(
    "Claude Code returned no result message",
  );
});
