#!/bin/bash

# Get initial metrics
echo "Getting initial metrics:"
curl -H "Authorization: Bearer p0ll1!!" "https://auth.pollinations.ai/admin/metrics?user_id=5099901"
echo -e "\n\n"

# Increment ad_clicks
echo "Incrementing ad_clicks:"
curl -X POST \
  -H "Authorization: Bearer p0ll1!!" \
  -H "Content-Type: application/json" \
  -d '{"increment": {"key": "ad_clicks", "by": 1}}' \
  "https://auth.pollinations.ai/admin/metrics?user_id=5099901"
echo -e "\n\n"

# Verify metrics after incrementing
echo "Getting metrics again to verify increment:"
curl -H "Authorization: Bearer p0ll1!!" "https://auth.pollinations.ai/admin/metrics?user_id=5099901"
echo -e "\n"