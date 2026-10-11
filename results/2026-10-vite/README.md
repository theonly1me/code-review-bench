# Results: 40 vite pull requests, October 2026

Greptile found the most known defects. Shadowclone had the highest share of findings that the judges confirmed. OpenQodex was last on every measure of bug finding.

## Setup

- **Cases:** 40 merged vite pull requests from March to October 2026. 13 have a defect that a later fix repaired, and 27 are clean. [`cases.json`](cases.json) lists them.
- **Reviewers:**
  - Shadowclone 0.0.28, local (`shadowclone review`) and as its pull request bot.
  - Greptile, as its pull request bot.
  - OpenQodex 0.11.0, local.
  - The local runs use `claude-opus-5-5` through Claude Code 2.1.296. The Shadowclone bot uses `claude-opus-5-5` through Claude Code 2.1.286. Greptile uses its own models.
- **Runs:** the local reviewers ran 3 times on each pull request. The bots ran once.
- **Bot copies:** each case is a draft pull request in [theonly1me/code-review-bench-cases](https://github.com/theonly1me/code-review-bench-cases/pulls). Greptile reviewed each pull request first, and the Shadowclone bot second. The Shadowclone bot reads only the pull request title, body, and code, never other comments ([`facts.ts`](https://github.com/theonly1me/shadowclone/blob/main/packages/review/src/collect/facts.ts#L20-L30)).
- **Judges:** Claude Opus 5.5 and GPT 6.1 Sol read the code with read-only tools. They labeled every finding in one anonymous pool `real`, `minor`, or `wrong`, and named the findings that identify each known defect. A label or a detection counts only when both judges agree.

## Results

| Rank | Reviewer          | Known defects found | Real findings per review | Findings judged real |
| ---- | ----------------- | ------------------- | ------------------------ | -------------------- |
| 1    | Greptile          | 9 of 13 (69%)       | 0.48                     | 68%                  |
| 2    | Shadowclone bot   | 5 of 13 (38%)       | 0.55                     | 96%                  |
| 2    | Shadowclone local | 14 of 39 (36%)      | 0.43                     | 91%                  |
| 3    | OpenQodex         | 12 of 39 (31%)      | 0.30                     | 86%                  |

No reviewer had a finding that both judges called wrong. [`report.md`](report.md) has the intervals, the minor and disputed counts, and the findings on clean pull requests.

## Each known defect

The cells show the runs that found the defect.

| Pull request                                                                                                                                                                                                                                                                         | Greptile | Shadowclone bot | Shadowclone local | OpenQodex |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------- | ----------------- | --------- |
| [#18](https://github.com/theonly1me/code-review-bench-cases/pull/18) pnpm GVS file system checks                                                                                                                                                                                     | 1/1      | 1/1             | 3/3               | 3/3       |
| [#20](https://github.com/theonly1me/code-review-bench-cases/pull/20) `nodenext` with `esnext`                                                                                                                                                                                        | 1/1      | 1/1             | 3/3               | 3/3       |
| [#29](https://github.com/theonly1me/code-review-bench-cases/pull/29) external CSS with lightningcss                                                                                                                                                                                  | 1/1      | 1/1             | 3/3               | 3/3       |
| [#4](https://github.com/theonly1me/code-review-bench-cases/pull/4) Oxc minifier for legacy chunks                                                                                                                                                                                    | 1/1      | 1/1             | 2/3               | 1/3       |
| [#39](https://github.com/theonly1me/code-review-bench-cases/pull/39) `--eslint` on other templates                                                                                                                                                                                   | 1/1      | 1/1             | 3/3               | 1/3       |
| [#32](https://github.com/theonly1me/code-review-bench-cases/pull/32) postfix out of `__VITE_ASSET__`                                                                                                                                                                                 | 1/1      | 0/1             | 0/3               | 1/3       |
| [#23](https://github.com/theonly1me/code-review-bench-cases/pull/23) `input` option                                                                                                                                                                                                  | 1/1      | 0/1             | 0/3               | 0/3       |
| [#34](https://github.com/theonly1me/code-review-bench-cases/pull/34) chunk import map                                                                                                                                                                                                | 1/1      | 0/1             | 0/3               | 0/3       |
| [#35](https://github.com/theonly1me/code-review-bench-cases/pull/35) real path root                                                                                                                                                                                                  | 1/1      | 0/1             | 0/3               | 0/3       |
| [#2](https://github.com/theonly1me/code-review-bench-cases/pull/2), [#11](https://github.com/theonly1me/code-review-bench-cases/pull/11), [#12](https://github.com/theonly1me/code-review-bench-cases/pull/12), [#27](https://github.com/theonly1me/code-review-bench-cases/pull/27) | 0        | 0               | 0                 | 0         |

## What the results show

1. **Greptile** found the most defects. It is the only reviewer that found #23, #34, and #35, and it found every defect that another reviewer found. The judges called 68% of its findings real, 9 minor, and 15 disputed.
2. **Shadowclone** had the most real findings per review and the highest real share. Both setups found the same five defects, and they missed four defects that Greptile found.
3. **OpenQodex** was last on known defects and on real findings per review. It found #4 and #39 in 1 of 3 runs, where local Shadowclone found them in 2 and 3 of 3 runs. Its only find that Shadowclone missed was #32, in 1 of 3 runs.

## Limits

- 13 known defects is a small sample, so the intervals in [`report.md`](report.md) are wide.
- The judges disagree on 43 findings, which wait for a blind decision. A decision can change the real share, but not the defect counts.
- Claude Opus 5.5 is a judge and also the model of three reviewers. The rule that both judges must agree reduces this risk.

## Files

- [`report.md`](report.md): the harness report.
- [`metrics.json`](metrics.json): the numbers behind the report.
- [`judged.json`](judged.json): every anonymous finding with the label and reason from each judge.
- [`runs.json`](runs.json): every review with its status and time.
- [`manifests.json`](manifests.json): the versions of each reviewer, Claude Code, and the linters.

The reviews ran with harness commit `5abc897`. The judging and the report ran with the anonymizer and Greptile fixes in `bded2f7`.
