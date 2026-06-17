#!/bin/bash

DELETED=0
FOUND=0
echo "[1/3] Fetching all issues mentioning 'codeberg'..."
ISSUES=$(gh api search/issues -X GET --paginate -f q="codeberg repo:pollinations/pollinations" -f per_page=100 --jq '.items[].number' 2>/dev/null | sort -un)
ISSUE_COUNT=$(echo "$ISSUES" | wc -l)
echo "      Found $ISSUE_COUNT issues."
echo ""
echo "[2/3] Scanning issues for bot comments containing 'codeberg'..."
COMMENT_IDS=()

for issue in $ISSUES; do
  comments=$(gh api "repos/pollinations/pollinations/issues/${issue}/comments" --paginate --jq \
    '.[] | select(.user.login == "pollinations-ai[bot]") | select(.body | test("codeberg"; "i")) | "\(.id)|\(.created_at)|\(.body[0:80])"' 2>/dev/null)

  if [ -n "$comments" ]; then
    while IFS= read -r line; do
      id=$(echo "$line" | cut -d'|' -f1)
      date=$(echo "$line" | cut -d'|' -f2)
      preview=$(echo "$line" | cut -d'|' -f3-)
      COMMENT_IDS+=("$id")
      FOUND=$((FOUND + 1))
      echo "  issue #${issue} | comment ${id} | ${date} | ${preview}..."
    done <<< "$comments"
  fi

  sleep 0.3
done
echo ""
echo "      Total comments found: $FOUND"
echo ""
if [ "$FOUND" -eq 0 ]; then
  echo "Nothing to delete."
  exit 0
fi
read -p "Delete all $FOUND comments? (y/n): " confirm
if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
  echo ""
  echo "[3/3] Deleting ${FOUND} comments..."
  for id in "${COMMENT_IDS[@]}"; do
    if gh api "repos/pollinations/pollinations/issues/comments/${id}" -X DELETE 2>/dev/null; then
      DELETED=$((DELETED + 1))
      echo "  Deleted comment $id ($DELETED/$FOUND)"
    else
      echo "  FAILED to delete comment $id"
    fi
    sleep 0.5
  done
  echo ""
  echo "Done. Deleted $DELETED/$FOUND comments."
else
  echo "Aborted."
fi
