# Method

## Cases

A case is a local repository with `main` at the base and `case` at the head. The case also lists its known defects. Each defect has a summary, a fix, and its locations when they are known. A case with no known defect is a clean case.

Each case belongs to the `dev` split or the `scored` split. Fix reviewer bugs with `dev` cases only. The case repository has a neutral path, so no reviewer sees the case name.

## Suites

1. `real`: merged vite pull requests. Blame mining finds a pull request that a later fix repaired, and two judges confirm the defect. The `dev` split comes from merges before 2026-03-01. The `scored` split comes from merges from 2026-03-01 to 2026-10-08.
2. `planted`: a large pull request with planted defects. Its manifest stays private until the results are public. The owner publishes the sha256 of the manifest before any review runs.

## Arms

Each review runs in a fresh, shared clone of the case repository. The harness removes the clone after the review.

- `shadowclone`: `shadowclone review --base main`, with checks and network on. The harness reads the JSON result.
- `openqodex`: `npx openqodex@0.11.0 review --base main` with the Claude reviewer, web tools, and the same model.
- `shadowclone-cloud` and `greptile`: a comment on a copy of the case, pushed to an evaluation repository as a draft pull request. The copy leaves out `.github/workflows`, and the harness skips a case whose change edits a workflow.

## Graders

**Blind judges:** Claude Opus 5.5 and GPT 6.1 Sol read the head code with read-only tools. Each judge labels every pooled, anonymous finding `real`, `minor`, or `wrong`, and names the findings that identify each known defect. A label counts when both judges agree. A person decides each disagreement blind, with no reviewer name.

## Rules

1. A command that calls a model prints its plan: the host, the model, and the number of calls. It runs only with `--yes` and a `--max-calls` ceiling that covers the plan.
2. Freeze the versions of each reviewer, Claude Code, and the model before a scored run. The run manifest records them.
3. Run each `scored` case 3 times for the local arms, and once for the cloud arms.
4. Publish the results with the raw outputs and the manifests.
5. If a reviewer changes after a scored run, run every scored suite again, and publish both rounds.

## Limits

- The cloud arms review only cases that do not change a workflow.
