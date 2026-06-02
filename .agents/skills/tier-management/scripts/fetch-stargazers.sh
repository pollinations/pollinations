#!/bin/bash
# Fetch and cache stargazers (run once or when stale)
CACHE_FILE="$(dirname "$0")/stargazers.txt"

# Fetch if file doesn't exist or is older than 1 day
if [ ! -f "$CACHE_FILE" ] || [ $(find "$CACHE_FILE" -mtime +1 2>/dev/null) ]; then
    echo "Fetching stargazers..." >&2
    gh api repos/pollinations/pollinations/stargazers --paginate --jq '.[].login' | tr '[:upper:]' '[:lower:]' | sort > "$CACHE_FILE"
    echo "Cached $(wc -l < "$CACHE_FILE" | tr -d ' ') stargazers" >&2
fi

# Check if username is in cache
if [ -n "$1" ]; then
    grep -qi "^$1$" "$CACHE_FILE" && echo "yes" || echo "no"
else
    cat "$CACHE_FILE"
fi
