#!/usr/bin/env bash
#
# Sync one Enter D1 table → the Tinybird datasource of the same name.
#
# Only the Enter Worker can read D1, so Enter exports the table page by page
# at /api/admin/trigger-d1-sync. This script collects every page into one
# NDJSON snapshot (each row stamped with synced_at), replaces the Tinybird
# datasource with it in one step (mode=replace), then checks that Tinybird
# holds exactly the exported row count and quarantined nothing. An empty
# export fails and keeps the existing snapshot.
#
# Runs every 4 hours, once per table, via
# .github/workflows/data-sync-d1-tinybird.yml.
#
# Usage: DATASOURCE=d1_user bash operations/data-sync/d1-to-tinybird.sh
#
# Env vars:
#   DATASOURCE           Required — d1_user, d1_apikey, d1_community_model,
#                        d1_session or d1_account
#   EXPORT_TOKEN         Required — the token whose SHA-256 Enter stores as
#                        D1_EXPORT_TOKEN_SHA256
#   TINYBIRD_TOKEN       Required — replaces the datasource
#   TINYBIRD_READ_TOKEN  Required — runs the row-count check
#   RUNNER_TEMP          Optional — work folder; a local run uses a new temp folder

set -euo pipefail

TINYBIRD_HOST=https://api.europe-west2.gcp.tinybird.co
: "${RUNNER_TEMP:=$(mktemp -d)}"

synced_at=$(date -u "+%Y-%m-%d %H:%M:%S")
snapshot="$RUNNER_TEMP/$DATASOURCE.ndjson"
page_file="$RUNNER_TEMP/$DATASOURCE-page.json"
cursor=""
total_rows=0
pages=0
: > "$snapshot"

while true; do
  pages=$((pages + 1))
  if [ "$pages" -gt 1000 ]; then
    echo "::error::$DATASOURCE exceeded 1000 pages"
    exit 1
  fi

  payload=$(jq -n \
    --arg datasource "$DATASOURCE" \
    --arg cursor "$cursor" \
    '{datasource: $datasource}
     + if $cursor == "" then {} else {cursor: $cursor} end')

  # A page takes about a second. curl retries a page that hangs or gets
  # a 5xx (D1 has short error bursts), instead of keeping the old
  # snapshot until the next run.
  http_code=$(curl -sS --max-time 60 --retry 2 --retry-delay 5 -o "$page_file" -w "%{http_code}" \
    -X POST "https://enter.pollinations.ai/api/admin/trigger-d1-sync" \
    -H "Authorization: Bearer $EXPORT_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$payload")

  if [ "$http_code" != "200" ]; then
    echo "::error::$DATASOURCE page $pages failed with HTTP $http_code"
    exit 1
  fi
  if ! jq -e \
    '.success == true and (.rows | type == "array") and (.done | type == "boolean")' \
    "$page_file" \
    >/dev/null; then
    echo "::error::$DATASOURCE page $pages returned an invalid response"
    exit 1
  fi

  rows=$(jq '.rows | length' "$page_file")
  total_rows=$((total_rows + rows))
  jq -c --arg synced_at "$synced_at" \
    '.rows[] + {synced_at: $synced_at}' "$page_file" >> "$snapshot"
  done=$(jq -r '.done' "$page_file")
  echo "$DATASOURCE page $pages: $rows rows"

  if [ "$done" = "true" ]; then
    break
  fi

  cursor=$(jq -r '.next_cursor // empty' "$page_file")
  if [ -z "$cursor" ]; then
    echo "::error::$DATASOURCE page $pages did not return next_cursor"
    exit 1
  fi
done

if [ "$total_rows" -eq 0 ]; then
  echo "::error::$DATASOURCE export was empty; keeping the existing Tinybird snapshot"
  exit 1
fi

import_file="$RUNNER_TEMP/$DATASOURCE-import.json"
http_code=$(curl -sS --max-time 300 -o "$import_file" -w "%{http_code}" \
  -X POST "$TINYBIRD_HOST/v0/datasources?name=$DATASOURCE&mode=replace&format=ndjson" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  -F "ndjson=@$snapshot;type=application/x-ndjson")

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  echo "::error::$DATASOURCE replacement failed with HTTP $http_code"
  exit 1
fi
if ! jq -e --arg datasource "$DATASOURCE" \
  '.datasource.name == $datasource' "$import_file" \
  >/dev/null; then
  echo "::error::$DATASOURCE replacement returned an invalid response"
  exit 1
fi

verification_file="$RUNNER_TEMP/$DATASOURCE-verification.json"
query="SELECT (SELECT count() FROM $DATASOURCE) AS imported_rows, (SELECT count() FROM ${DATASOURCE}_quarantine) AS quarantine_rows FORMAT JSON"
http_code=$(curl -sS --max-time 30 -G -o "$verification_file" -w "%{http_code}" \
  "$TINYBIRD_HOST/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_READ_TOKEN" \
  --data-urlencode "q=$query")

if [ "$http_code" != "200" ]; then
  echo "::error::$DATASOURCE verification failed with HTTP $http_code"
  exit 1
fi
if ! jq -e \
  '(.data | type) == "array" and (.data | length) == 1
   and (.data[0].imported_rows | type == "number")
   and (.data[0].quarantine_rows | type == "number")' \
  "$verification_file" \
  >/dev/null; then
  echo "::error::$DATASOURCE verification returned an invalid response"
  exit 1
fi

imported_rows=$(jq -r '.data[0].imported_rows' "$verification_file")
quarantine_rows=$(jq -r '.data[0].quarantine_rows' "$verification_file")
if [ "$imported_rows" -ne "$total_rows" ] || [ "$quarantine_rows" -ne 0 ]; then
  echo "::error::$DATASOURCE validation failed: expected=$total_rows imported=$imported_rows quarantined=$quarantine_rows"
  exit 1
fi

echo "::notice::$DATASOURCE replaced atomically: $total_rows rows across $pages pages"
