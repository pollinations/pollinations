#!/usr/bin/env bash
# Enable CloudFront Standard logging v2 -> CloudWatch Logs for the migrated distributions.
#
# Why this exists: CloudFront issues 504/timeout errors at the edge BEFORE the request
# reaches the worker, so those failures are invisible to Cloudflare/worker logs. The only
# place they surface is CloudFront's own access logs. v2 standard logging delivers them to
# CloudWatch Logs where they're queryable with Logs Insights (no S3/Athena needed).
#
# v2 logging is NOT the legacy `Logging` block in the distribution config. It is configured
# via the CloudWatch Logs *delivery* API: delivery-source -> delivery-destination -> delivery.
# That is why it cannot live in the distribution-*.json files and needs this script instead.
#
# Idempotent: re-running is safe (put-* calls upsert; create-delivery is skipped if present).
#
# Prereqs: AWS CLI authed to the CloudFront account, with logs:* + cloudfront:* permissions.
#   AWS_PROFILE=admin AWS_REGION=us-east-1 ./setup-logging.sh

set -euo pipefail
PROFILE="${AWS_PROFILE:-admin}"
REGION="${AWS_REGION:-us-east-1}"
ACCT="$(aws --profile "$PROFILE" sts get-caller-identity --query Account --output text)"

# name -> CloudFront distribution id. Keep in sync with the distribution-*.json files.
DISTS=(
  "gen:E35MFLKOJK04O7"
  "enter:E1621Y522BHBWP"
  "media:E1Z6LB9U99HNL7"
  "apex:E3TC5DH134RLUG"
  "image:E1ODE9U7PM1DCA"
  "text:E1N0S50MFRA845"
)

# Record fields delivered to CloudWatch. Chosen for timeout/error diagnosis:
#   - sc-status / x-edge-result-type / x-edge-detailed-result-type: classify 504s
#     (OriginCommError = connect/read timeout; ClientCommError = viewer hung up)
#   - time-taken / time-to-first-byte: distinguish ~10s connect-timeout vs ~180s read-timeout
#   - cs-method / cs-uri-stem: GET (image) vs POST (chat) and which path
#   - x-edge-location: which CloudFront POP (clusters connect-timeouts by edge->Cloudflare path)
#   - ssl-protocol / cs-protocol-version / sc-bytes / cs-bytes / c-port: request shape
# NOTE: the valid field name is `cs(Host)` WITH parens. Passed quoted so the shell keeps it.
FIELDS=(
  timestamp DistributionId date time x-edge-location c-ip cs-method cs-uri-stem
  sc-status x-edge-result-type x-edge-detailed-result-type x-edge-response-result-type
  time-taken time-to-first-byte 'cs(Host)' x-host-header cs-protocol cs-protocol-version
  ssl-protocol sc-bytes cs-bytes c-port x-edge-request-id
)

for pair in "${DISTS[@]}"; do
  name="${pair%%:*}"; id="${pair#*:}"
  lg="/cloudfront/${name}-pollinations"
  src="${name}-cf-source"
  dst="${name}-cf-dest"
  echo "=== ${name} (${id}) -> ${lg} ==="

  # 1. CloudWatch log group
  aws --profile "$PROFILE" --region "$REGION" logs create-log-group \
    --log-group-name "$lg" 2>/dev/null || true

  # 2. delivery source = the CloudFront distribution's ACCESS_LOGS
  aws --profile "$PROFILE" --region "$REGION" logs put-delivery-source \
    --name "$src" --log-type ACCESS_LOGS \
    --resource-arn "arn:aws:cloudfront::${ACCT}:distribution/${id}" >/dev/null

  # 3. delivery destination = the CloudWatch log group
  aws --profile "$PROFILE" --region "$REGION" logs put-delivery-destination \
    --name "$dst" \
    --delivery-destination-configuration "destinationResourceArn=arn:aws:logs:${REGION}:${ACCT}:log-group:${lg}" >/dev/null

  # 4. delivery = link source -> destination with the record fields (skip if it already exists)
  src_arn="arn:aws:logs:${REGION}:${ACCT}:delivery-source:${src}"
  dst_arn="arn:aws:logs:${REGION}:${ACCT}:delivery-destination:${dst}"
  if aws --profile "$PROFILE" --region "$REGION" logs describe-deliveries \
       --query "deliveries[?deliverySourceName=='${src}'] | [0].id" --output text | grep -qv '^None$'; then
    echo "  delivery already exists, skipping create"
  else
    aws --profile "$PROFILE" --region "$REGION" logs create-delivery \
      --delivery-source-name "$src" \
      --delivery-destination-arn "$dst_arn" \
      --record-fields "${FIELDS[@]}" \
      --query 'delivery.id' --output text
  fi
done

echo "done. Query example (timeout breakdown, last 30m):"
cat <<'EOF'
  aws --profile admin --region us-east-1 logs start-query \
    --log-group-name /cloudfront/gen-pollinations \
    --start-time $(( $(date -u +%s) - 1800 )) --end-time $(date -u +%s) \
    --query-string 'parse @message "\"sc-status\":\"*\"" as status
      | parse @message "\"time-taken\":\"*\"" as ttaken
      | parse @message "\"x-edge-location\":\"*\"" as pop
      | filter status = "504"
      | stats count(*) as n by pop, ttaken | sort n desc'
EOF
