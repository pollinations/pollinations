# Simple Conversation Logging

Minimal solution to log conversations locally for later LLM analysis.

## Files

- `simpleLogger.js` - Logs 5% of conversations (last 3 messages) to `user_logs/conversations.jsonl`
- `processLogs.js` - Script to read and process the logs

## How it works

1. **Automatic logging**: 5% of conversations (last 3 messages) are saved to `user_logs/conversations.jsonl`
2. **Process later**: Run `node processLogs.js` to analyze the logs
3. **Add LLM classification**: Modify `processLogs.js` to send conversations to your LLM for analysis

## Log format

Each line in `conversations.jsonl`:
```json
{
  "timestamp": "2025-01-17T10:30:45.123Z",
  "model": "gpt-4",
  "username": "user123",
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"}
  ],
  "total_messages": 5
}
```

## Usage

```bash
# View logged conversations
node processLogs.js

# Check log file directly
tail user_logs/conversations.jsonl
```

That's it! Simple and minimal.
