#!/bin/bash

# Capture billing logs for analysis
# This script captures logs from enter.pollinations.ai for billing discrepancy analysis

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="billing-logs-$TIMESTAMP"
DURATION=${1:-120} # Default 2 minutes, can override with argument

echo "Creating log directory: $LOG_DIR"
mkdir -p $LOG_DIR

echo "Starting billing log capture for $DURATION seconds..."
echo "This will capture:"
echo "  - Wrangler tail logs (formatted and raw)"
echo "  - D1 database events"
echo "  - Tinybird analytics data"
echo ""

# Start wrangler tail in background with formatted output
echo "Starting formatted log capture..."
timeout $DURATION npx wrangler tail --env production | jq -c '.logs[].message[] | fromjson' | npx tsx scripts/format-logs.ts > "$LOG_DIR/formatted-logs.txt" 2>&1 &
PID1=$!

# Start wrangler tail in background with raw JSON
echo "Starting raw JSON log capture..."
timeout $DURATION npx wrangler tail --env production | jq '.logs[].message[] | fromjson' > "$LOG_DIR/raw-logs.jsonl" 2>&1 &
PID2=$!

# Capture only billing-related logs
echo "Starting billing-specific log capture..."
timeout $DURATION npx wrangler tail --env production | jq '.logs[].message[] | fromjson | select(.properties.totalPrice or .properties.totalCost or .properties.isBilledUsage or .message | contains("balance") or .message | contains("Decrement") or .message | contains("Tracking event"))' > "$LOG_DIR/billing-logs.jsonl" 2>&1 &
PID3=$!

echo ""
echo "Logs are being captured to $LOG_DIR/"
echo "Press Ctrl+C to stop early, or wait $DURATION seconds..."

# Wait for all background processes
wait $PID1 $PID2 $PID3

echo ""
echo "Log capture complete. Files created:"
echo "  - $LOG_DIR/formatted-logs.txt (human-readable)"
echo "  - $LOG_DIR/raw-logs.jsonl (raw JSON)"
echo "  - $LOG_DIR/billing-logs.jsonl (billing-specific)"
echo ""
echo "Now querying D1 and Tinybird for comparison data..."

# Query D1 for recent events
echo "Querying D1 database for recent events..."
npx wrangler d1 execute pollinations-db --remote --command "
SELECT
    COUNT(*) as event_count,
    SUM(total_price) as total_price_sum,
    SUM(total_cost) as total_cost_sum,
    AVG(total_price) as avg_price,
    AVG(total_cost) as avg_cost,
    model_requested,
    response_status
FROM event
WHERE created_at > datetime('now', '-5 minutes')
GROUP BY model_requested, response_status
ORDER BY event_count DESC
LIMIT 20
" > "$LOG_DIR/d1-summary.txt" 2>&1

# Query Tinybird for recent analytics
echo "Querying Tinybird for recent analytics..."

# Get the public token from model monitor
TINYBIRD_TOKEN="p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJmZTRjODM1Ni1iOTYwLTQ0ZTYtODE1Mi1kY2UwYjc0YzExNjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.Wc49vYoVYI_xd4JSsH_Fe8mJk7Oc9hx0IIldwc1a44g"

curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=$TINYBIRD_TOKEN" | jq '.' > "$LOG_DIR/tinybird-model-health.json"

echo ""
echo "Analysis data captured to $LOG_DIR/"
echo ""
echo "To analyze the data, run:"
echo "  npx tsx scripts/analyze-billing-logs.ts $LOG_DIR"