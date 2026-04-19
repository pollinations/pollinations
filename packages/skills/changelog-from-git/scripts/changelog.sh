#!/usr/bin/env bash
# changelog-from-git — turn a git log range into release notes via polli.
#
# Usage:
#   changelog.sh                         # from last tag to HEAD, release style
#   changelog.sh v1.0.0..HEAD            # explicit range
#   changelog.sh --since '7 days ago'
#   changelog.sh --style pr  main..HEAD
#   changelog.sh --style digest --since '30 days ago'
#   changelog.sh --raw                   # just the commits, no LLM
#   changelog.sh [opts] -- <pathspec>    # scoped to a path

set -euo pipefail

STYLE="release"
RAW=0
SINCE=""
RANGE=""
ALL=0
SUMMARIZE_FIRST=0
MODEL="${POLLI_TEXT_MODEL:-openai}"
PATHSPEC=()

while [ $# -gt 0 ]; do
  case "$1" in
    --style) STYLE="$2"; shift 2;;
    --since) SINCE="$2"; shift 2;;
    --raw) RAW=1; shift;;
    --all) ALL=1; shift;;
    --summarize-first) SUMMARIZE_FIRST=1; shift;;
    --model) MODEL="$2"; shift 2;;
    --) shift; PATHSPEC=("$@"); break;;
    -h|--help) sed -n '2,12p' "$0"; exit 0;;
    *) RANGE="$1"; shift;;
  esac
done

if [ -z "$RANGE" ] && [ -z "$SINCE" ]; then
  if LAST=$(git describe --tags --abbrev=0 2>/dev/null); then
    RANGE="${LAST}..HEAD"
  else
    RANGE="HEAD"
  fi
fi

LOG_ARGS=(--no-merges --pretty=format:'%h|%s|%an|%ad' --date=short)
[ "$ALL" -eq 1 ] || LOG_ARGS+=(--invert-grep --grep='^chore(deps)' --grep='dependabot' --grep='^Merge ')
[ -n "$SINCE" ] && LOG_ARGS+=(--since="$SINCE")
[ -n "$RANGE" ] && LOG_ARGS+=("$RANGE")
[ ${#PATHSPEC[@]} -gt 0 ] && LOG_ARGS+=(-- "${PATHSPEC[@]}")

COMMITS=$(git log "${LOG_ARGS[@]}")
if [ -z "$COMMITS" ]; then
  echo "no commits in range" >&2; exit 1
fi
COUNT=$(printf '%s\n' "$COMMITS" | wc -l | tr -d ' ')

if [ "$RAW" -eq 1 ]; then
  printf '%s\n' "$COMMITS"; exit 0
fi

if [ "$COUNT" -gt 500 ] && [ "$SUMMARIZE_FIRST" -eq 0 ]; then
  echo "warning: $COUNT commits — consider --summarize-first" >&2
fi

case "$STYLE" in
  release)
    SYS='You write release notes from git log. Group bullets under ### Features / ### Fixes / ### Docs / ### Chores. Each bullet starts with a verb (Add/Fix/Remove/Update). Put PR/issue numbers at the end in parens. Collapse dependabot bumps into one line. No marketing adjectives. Output markdown only, no preamble.';;
  pr)
    SYS='You write a concise PR description from git log. Start with "## Summary" then 3-7 bullets. Each bullet verb-led. Under 200 words total. End with "## Test plan" and an empty checklist. No marketing.';;
  digest)
    SYS='You write a short narrative digest (one paragraph, then a short bullet list of highlights) from git log. Conversational but dense. Link notable PRs by number. No marketing adjectives.';;
  *) echo "unknown --style: $STYLE" >&2; exit 2;;
esac

PROMPT=$(cat <<EOF
Commits (oldest first, format: hash|subject|author|date) in range ${RANGE:-${SINCE}}${PATHSPEC:+ (path: ${PATHSPEC[*]})}:

${COMMITS}

Write the ${STYLE} notes.
EOF
)

if ! command -v polli >/dev/null 2>&1; then
  echo "polli CLI not found — install from packages/polli-cli or see polli skill" >&2
  exit 127
fi

polli gen text "$PROMPT" --model "$MODEL" --system "$SYS"
