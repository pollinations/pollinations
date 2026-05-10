#!/usr/bin/env bash
set -e

cd enter.pollinations.ai
npm install

RESULTS="[]"
for row in $(echo "$PAYOUTS" | jq -c '.[]'); do
    ISSUE=$(echo "$row" | jq -r '.issue')
    USER=$(echo "$row" | jq -r '.recipient')
    AMOUNT=$(echo "$row" | jq -r '.amount')
    ROLE=$(echo "$row" | jq -r '.role')
    echo "→ granting $AMOUNT Pollen to @$USER ($ROLE) for #$ISSUE"

    set +e
    OUT=$(npx tsx src/tier-progression/shared/quest-grant-pollen.ts grant \
        --githubUsername "$USER" --amount "$AMOUNT" \
        --questIssue "$ISSUE" --prNumber "$PR_NUMBER" --role "$ROLE" \
        --env production 2>&1)
    RC=$?
    set -e
    echo "$OUT"

    case "$RC" in
        0) STATUS="granted" ;;
        2) STATUS="not_found" ;;
        3) STATUS="duplicate" ;;
        *) STATUS="error" ;;
    esac

    RESULTS=$(echo "$RESULTS" | jq -c \
        --argjson issue "$ISSUE" --arg user "$USER" \
        --argjson amount "$AMOUNT" --arg role "$ROLE" --arg status "$STATUS" \
        '. + [{issue:$issue, user:$user, amount:$amount, role:$role, status:$status}]')
done

echo "results=$RESULTS" >> "$GITHUB_OUTPUT"
