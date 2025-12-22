#!/bin/bash
# Check if a GitHub user is a developer (has repos, followers, or old account)
# Usage: ./check-github-dev.sh <username>
# Returns: "dev" or "not-dev" with details

USERNAME="${1:-}"
if [ -z "$USERNAME" ]; then
    echo "Usage: $0 <github_username>" >&2
    exit 1
fi

# Fetch GitHub profile
RESPONSE=$(curl -s "https://api.github.com/users/$USERNAME")

# Check for rate limiting or not found
if echo "$RESPONSE" | grep -q '"message"'; then
    MESSAGE=$(echo "$RESPONSE" | jq -r '.message')
    echo "error: $MESSAGE" >&2
    exit 1
fi

# Extract metrics
PUBLIC_REPOS=$(echo "$RESPONSE" | jq -r '.public_repos // 0')
FOLLOWERS=$(echo "$RESPONSE" | jq -r '.followers // 0')
CREATED_AT=$(echo "$RESPONSE" | jq -r '.created_at // "unknown"')
YEAR=$(echo "$CREATED_AT" | cut -c1-4)

# Determine if dev
IS_DEV="no"
REASONS=""

if [ "$PUBLIC_REPOS" -gt 0 ] 2>/dev/null; then
    IS_DEV="yes"
    REASONS="${REASONS}repos=$PUBLIC_REPOS "
fi

if [ "$FOLLOWERS" -gt 0 ] 2>/dev/null; then
    IS_DEV="yes"
    REASONS="${REASONS}followers=$FOLLOWERS "
fi

if [ "$YEAR" -lt 2025 ] 2>/dev/null; then
    IS_DEV="yes"
    REASONS="${REASONS}account_year=$YEAR "
fi

if [ "$IS_DEV" = "yes" ]; then
    echo "dev: $REASONS"
else
    echo "not-dev: repos=0 followers=0 created=$CREATED_AT"
fi
