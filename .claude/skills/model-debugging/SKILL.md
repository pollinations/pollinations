---
name: model-debugging
description: Debug and diagnose model errors in Pollinations services. Analyze logs from image.pollinations.ai, text.pollinations.ai, and enter.pollinations.ai to identify root causes of failures.
---

# Model Debugging Skill

Use this skill when investigating model failures, high error rates, or service issues in the Pollinations infrastructure.

---

# Quick Diagnostics

## 1. Check Model Monitor
View current model health at: https://monitor.pollinations.ai

## 2. Query Recent Errors from D1 Database
```bash
# Via enter.pollinations.ai worker (requires wrangler)
cd enter.pollinations.ai
npx wrangler d1 execute pollinations-db --remote --command "SELECT model_requested, response_status, error_message, COUNT(*) as count FROM event WHERE response_status >= 400 AND created_at > datetime('now', '-1 hour') GROUP BY model_requested, response_status, error_message ORDER BY count DESC LIMIT 20"
```

## 3. Capture Live Logs

### enter.pollinations.ai (Cloudflare Worker)
```bash
cd enter.pollinations.ai
wrangler tail --format json | tee logs.jsonl
# Or with formatting:
wrangler tail --format json | npx tsx scripts/format-logs.ts
```

### image.pollinations.ai (EC2 systemd)
```bash
# Real-time logs
ssh enter-services "sudo journalctl -u image-pollinations.service -f"

# Last 3 minutes
ssh enter-services "sudo journalctl -u image-pollinations.service --since '3 minutes ago' --no-pager" > image-service-logs.txt

# Recent errors only
ssh enter-services "sudo journalctl -u image-pollinations.service -p err -n 50"
```

### text.pollinations.ai (EC2 systemd)
```bash
# Real-time logs
ssh enter-services "sudo journalctl -u text-pollinations.service -f"

# Last 3 minutes
ssh enter-services "sudo journalctl -u text-pollinations.service --since '3 minutes ago' --no-pager" > text-service-logs.txt
```

---

# Common Error Patterns

## Azure Content Safety DNS Failure
**Error**: `getaddrinfo ENOTFOUND gptimagemain1-resource.cognitiveservices.azure.com`
**Cause**: Azure Content Safety resource deleted or misconfigured
**Impact**: Fail-open (content proceeds without safety check)
**Fix**: Create new Azure Content Safety resource and update `.env`:
```
AZURE_CONTENT_SAFETY_ENDPOINT=https://<new-resource>.cognitiveservices.azure.com/
AZURE_CONTENT_SAFETY_API_KEY=<new-key>
```

## Azure Kontext Content Filter
**Error**: `Content rejected due to sexual/hate/violence content detection`
**Cause**: Azure's content moderation blocking prompts/images
**Impact**: 400 error returned to user
**Fix**: User error - prompt violates content policy

## Vertex AI Invalid Image
**Error**: `Provided image is not valid`
**Cause**: User passing unsupported image URL (e.g., Google Drive links)
**Impact**: 400 error returned to user
**Fix**: User error - need direct image URL

## Translation Service Down
**Error**: `No active translate servers available`
**Cause**: Translation service unavailable
**Impact**: Prompts not translated (non-fatal)
**Fix**: Check translation service status

## OpenAI Audio Invalid Voice
**Error**: `Invalid value for audio.voice`
**Cause**: User requesting unsupported voice name
**Impact**: 400 error returned to user
**Fix**: User error - use supported voices: alloy, echo, fable, onyx, nova, shimmer, coral, verse, ballad, ash, sage, etc.

## Veo No Video Data
**Error**: `No video data in response`
**Cause**: Vertex AI returned empty video response
**Impact**: 500 error
**Fix**: Check Vertex AI quota/status, may be transient

---

# Environment Variables to Check

## image.pollinations.ai
```bash
ssh enter-services "cat /home/ubuntu/pollinations/image.pollinations.ai/.env | grep -E 'AZURE|GOOGLE|CLOUDFLARE'"
```

Key variables:
- `AZURE_CONTENT_SAFETY_ENDPOINT` - Azure Content Safety API endpoint
- `AZURE_CONTENT_SAFETY_API_KEY` - Azure Content Safety API key
- `GOOGLE_PROJECT_ID` - Google Cloud project for Vertex AI
- `AZURE_MYCELI_FLUX_KONTEXT_ENDPOINT` - Azure Kontext model endpoint

## text.pollinations.ai
```bash
ssh enter-services "cat /home/ubuntu/pollinations/text.pollinations.ai/.env | grep -E 'AZURE|OPENAI|GOOGLE'"
```

---

# Updating Secrets

Secrets are stored encrypted with SOPS:
- `image.pollinations.ai/secrets/env.json`
- `text.pollinations.ai/secrets/env.json`

To update:
```bash
# Decrypt, edit, re-encrypt
sops image.pollinations.ai/secrets/env.json

# Deploy to server
sops --output-type dotenv -d image.pollinations.ai/secrets/env.json > /tmp/image.env
scp /tmp/image.env enter-services:/home/ubuntu/pollinations/image.pollinations.ai/.env
rm /tmp/image.env

# Restart service
ssh enter-services "sudo systemctl restart image-pollinations.service"
```

---

# Log Analysis Commands

```bash
# Count errors by type
grep -i "error" image-service-logs.txt | grep -oE "(Azure Flux Kontext|Vertex AI|No active translate|getaddrinfo ENOTFOUND)" | sort | uniq -c | sort -rn

# Find content filter rejections
grep -i "Content rejected" image-service-logs.txt | sort | uniq -c

# Check DNS resolution on server
ssh enter-services "nslookup gptimagemain1-resource.cognitiveservices.azure.com"
```

---

# Model-Specific Debugging

| Model | Backend | Common Issues |
|-------|---------|---------------|
| `flux` | Azure/Replicate | Rate limits, content filter |
| `kontext` | Azure Flux Kontext | Content filter (strict) |
| `nanobanana` | Vertex AI Gemini | Invalid image URLs, content filter |
| `seedream-pro` | ByteDance ARK | NSFW filter, API key issues |
| `veo` | Vertex AI | Quota, empty responses |
| `openai-audio` | Azure OpenAI | Invalid voice names |
| `deepseek` | DeepSeek API | Rate limits, API key |

---

# Notes

- **401 errors**: User authentication issues (no API key)
- **403 errors**: Pollen/quota issues (user ran out of credits)
- **400 errors**: Usually user input errors (bad prompts, invalid params)
- **500 errors**: Backend/infrastructure issues (investigate)
- **504 errors**: Timeouts (model too slow or hung)
