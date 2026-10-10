# code-review-bench

This benchmark compares AI code reviewers on known defects. Clone it, install the reviewers, and run each step to get the same numbers.

It runs each reviewer through its public CLI or its pull request bot. It has no code from any reviewer.

| Suite     | Cases                                                                                   | Known defects                                              |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `real`    | Merged vite pull requests. The `dev` split is for development, and `scored` is the test | One defect for each defect case, confirmed by two judges   |
| `planted` | A large pull request with a private manifest                                            | The manifest lists them, and its sha256 is published first |

`data/vite` has the mined pull requests, the judge checks, and the selected cases for each split, so a clone builds the same cases.

[`docs/method.md`](docs/method.md) explains the case format, the arms, the graders, and the rules that keep the comparison fair.

## Arms

- `shadowclone`: `shadowclone review --base main --model <model> --output review.json`, with checks and network on.
- `openqodex`: `npx openqodex@0.11.0 review --base main --reviewer claude --reviewer-web on`, with `ANTHROPIC_MODEL` set to the same model.
- `shadowclone-cloud` and `greptile`: the bot comment on a draft pull request in an evaluation repository.

The local arms use `claude-opus-5-5` at the default effort. Greptile uses its own models.

## Requirements

- Bun 1.4.2, Node.js, Git, and the GitHub CLI (`gh`).
- Claude Code, signed in. The `shadowclone`, `openqodex`, and `opus` judge steps use it.
- Codex, signed in. The `sol` judge uses it.
- Shadowclone: the `shadowclone` command, or a source checkout passed with `--shadowclone <folder>`.
- The review linters on the `PATH`: shellcheck 0.10.0, hadolint 2.15.1, actionlint 1.7.7, zizmor 1.30.1, squawk 2.66.0, and trivy 0.75.0. The run manifest lists the linters that it found.

## Run it

Use a private work folder outside every repository. Each command that calls a model prints its plan first. It runs only with `--yes` and a `--max-calls` ceiling that covers the plan.

1. Install the dependencies: `bun install`.
2. Install the OpenQodex scanners, so that no review runs without them: `npx -y openqodex@0.11.0 doctor --install --all-scanners`.
3. Clone vite: `git clone https://github.com/vitejs/vite <vite>`.
4. Build the cases:

   ```bash
   bun src/cli.ts cases --work <work> --suite real --split dev --mined data/vite/dev --clone <vite>
   bun src/cli.ts cases --work <work> --suite real --split scored --mined data/vite/scored --clone <vite>
   bun src/cli.ts cases --work <work> --suite planted --manifest <private manifest>
   ```

   To mine a new window instead, run `mine` and `validate` into a new folder, and pass that folder to `--mined`:

   ```bash
   bun src/cli.ts mine --repo vitejs/vite --clone <vite> --since 2025-07-01 --until 2026-02-28 --introduced-before 2026-01-29 --mined <mined>
   bun src/cli.ts validate --mined <mined> --clone <vite> --yes --max-calls 40
   ```

5. Run each arm. `--repeats` sets the runs for each case, and `--limit` sets the reviews that run at the same time:

   ```bash
   bun src/cli.ts run --work <work> --suite real --split scored --arm shadowclone --shadowclone <shadowclone checkout> --run <name> --repeats 3 --limit 4 --yes --max-calls 120
   bun src/cli.ts run --work <work> --suite real --split scored --arm openqodex --run <name> --repeats 3 --limit 4 --yes --max-calls 120
   ```

6. Grade and report:

   ```bash
   bun src/cli.ts judge --work <work> --suite real --split scored --run <name> --yes --max-calls 80
   bun src/cli.ts report --work <work> --suite real --split scored --run <name>
   ```

A run resumes. It skips each review that has a `done` result. The report writes `report-<suite>-<split>.md` and `metrics-<suite>-<split>.json` into the run folder.

## Cloud arms

1. Copy the cases to an evaluation repository: `bun src/cli.ts copy --work <work> --suite real --split scored --eval-repo <owner/name>`. The copy leaves out `.github/workflows`, and it skips a case whose change edits a workflow.
2. Install the Shadowclone bot and Greptile on that repository.
3. Run `--arm shadowclone-cloud` or `--arm greptile` with `--repeats 1`.

## Grading

- **Blind judges:** Claude Opus 5.5 and GPT 6.1 Sol label each pooled finding `real`, `minor`, or `wrong`. They also name the findings that identify each known defect. A label or a detection counts when both judges agree.
- **Disputes:** `bun src/cli.ts disputes` writes each disputed finding with both reasons and no reviewer name. Put the blind decisions in `tiebreaks.json` in the run folder, as `{ "<finding id>": "real" }`.

## Check the harness

```bash
bun run check
```

This runs the type check, the unit tests, and the format check. It makes no model call.
