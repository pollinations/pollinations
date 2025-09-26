# Text API Logging System

This directory contains logging utilities for the Pollinations text API service.

## Rate Limit Error Logging

### Overview
The rate limit logging system captures detailed information about 429 (Too Many Requests) errors to help debug text API stability issues.

### Files
- `rateLimitLogger.js` - Main logging utility
- `../scripts/check-rate-limits.js` - Analysis script
- `../logs/rate-limit-errors.jsonl` - Log file (JSONL format)

### What Gets Logged
When a 429 error occurs, the system logs:

- **User Information**: username, userId, tier, IP, authentication status
- **Queue State**: current size, max allowed, pending requests, utilization %
- **Request Details**: model, method, path, user agent, referrer
- **Error Context**: message, status, auth method, timing

### Usage

#### View Recent Rate Limit Errors
```bash
# Last 1 hour (default)
node scripts/check-rate-limits.js

# Last 24 hours  
node scripts/check-rate-limits.js 24
```

#### Example Output
```
🔍 Rate Limit Analysis - Last 1 hour(s)

📊 Total Rate Limit Errors: 15
📈 Average Queue Utilization: 87%

🎯 Errors by Tier:
  seed: 12 errors
  anonymous: 3 errors

🤖 Errors by Model:
  openai-large: 8 errors
  grok: 4 errors
  claude: 3 errors

👥 Top Users with Errors:
  user123: 5 errors
  anonymous: 3 errors
```

#### Raw Log Analysis
```bash
# View raw log entries
cat logs/rate-limit-errors.jsonl

# Filter by specific user
grep "testuser" logs/rate-limit-errors.jsonl

# Count errors in last hour
grep "$(date -d '1 hour ago' -u +%Y-%m-%d)" logs/rate-limit-errors.jsonl | wc -l
```

### Integration
The logging is automatically integrated into the shared `ipQueue.js` module and will capture 429 errors from all services that use it.

### Log Format
Each log entry is a JSON object with this structure:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "error_type": "QUEUE_FULL",
  "service": "text-api",
  "user": {
    "username": "user123",
    "userId": "abc-123", 
    "tier": "seed",
    "ip": "1.2.3.4",
    "authenticated": true,
    "bypass_reason": "VALID_TOKEN"
  },
  "queue_state": {
    "current_size": 15,
    "max_allowed": 15,
    "pending_requests": 8,
    "total_in_queue": 15,
    "tier_cap": 3,
    "interval_ms": 1000,
    "force_cap": false
  },
  "request_info": {
    "model": "openai-large",
    "method": "POST",
    "path": "/v1/chat/completions",
    "user_agent": "...",
    "referrer": "...",
    "content_type": "application/json"
  },
  "error_details": {
    "message": "Queue full for user...",
    "status": 429
  },
  "context": {
    "queue_utilization_percent": 100,
    "is_token_authenticated": true,
    "auth_method": "VALID_TOKEN"
  }
}
```

### Testing
Run the test script to verify logging works:
```bash
node test-rate-limit-logging.js
```

## Other Logging Systems

### User-Specific Logging (`userLogger.js`)
- Logs detailed request/response data for specific users
- Controlled by `DEBUG_USERS` environment variable
- Creates separate log files per user

### Conversation Logging (`simpleLogger.js`) 
- Logs conversations to JSONL format for analysis
- Samples conversations for classification
- Excludes specific users for privacy

---

**Related GitHub Issue**: [#4196 - Text API Stability: High Rate Limit Failures & Enhanced Debugging](https://github.com/pollinations/pollinations/issues/4196)
