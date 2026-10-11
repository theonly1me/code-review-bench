#!/usr/bin/env bash
set -euo pipefail

: "${WORK:?Set WORK to a private work folder outside every repository}"
: "${RUN:?Set RUN to a name for this run, such as my-first-run}"
VITE="${VITE:-$WORK/vite}"
EVAL_REPO="${EVAL_REPO:-}"
SHADOWCLONE_BOT="${SHADOWCLONE_BOT:-}"
LOCAL_ARMS="${LOCAL_ARMS:-shadowclone openqodex}"
REPEATS="${REPEATS:-3}"
cd "$(dirname "$0")/.."

mkdir -p "$WORK"
[ -d "$VITE/.git" ] || git clone --quiet https://github.com/vitejs/vite "$VITE"
[ -f "$WORK/cases/real-scored.json" ] ||
  bun src/cli.ts cases --work "$WORK" --suite real --split scored --mined data/vite/scored --clone "$VITE"

for arm in $LOCAL_ARMS; do
  bun src/cli.ts run --work "$WORK" --suite real --split scored --arm "$arm" \
    --run "$RUN" --repeats "$REPEATS" --limit 3 --yes --max-calls $((40 * REPEATS))
done

if [ -n "$EVAL_REPO" ]; then
  bun src/cli.ts copy --work "$WORK" --suite real --split scored --eval-repo "$EVAL_REPO"
  bun src/cli.ts run --work "$WORK" --suite real --split scored --arm greptile \
    --run "$RUN" --repeats 1 --limit 4 --yes --max-calls 40
  if [ -n "$SHADOWCLONE_BOT" ]; then
    bun src/cli.ts run --work "$WORK" --suite real --split scored --arm shadowclone-cloud \
      --shadowclone-bot "$SHADOWCLONE_BOT" --run "$RUN" --repeats 1 --limit 4 --yes --max-calls 40
  fi
fi

bun src/cli.ts judge --work "$WORK" --suite real --split scored --run "$RUN" --yes --max-calls 80
bun src/cli.ts report --work "$WORK" --suite real --split scored --run "$RUN"
