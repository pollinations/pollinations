# User Request Logging

Simple logging system to debug specific user requests by logging their inputs and outputs to separate files.

## Usage

1. **Set environment variable** with comma-separated usernames:
   
   **Option A: Using .env file (recommended)**
   ```bash
   # Add to your .env file:
   DEBUG_USERS="username1,username2,username3"
   # or log all users:
   DEBUG_USERS="all"
   ```
   
   **Option B: Using command line**
   ```bash
   export DEBUG_USERS="username1,username2,username3"
   # or log all users:
   export DEBUG_USERS="all"
   ```

2. **Restart the text service** to pick up the environment variable.

3. **Log files will be created** in `user_logs/` directory:
   - `user_logs/username1.log`
   - `user_logs/username2.log`
   - etc.

## Log Format

Each line contains:
- Timestamp
- JSON object with request/response data

Example:
```
2025-07-03T16:04:20.360Z | {"timestamp":"2025-07-03T16:04:20.360Z","username":"testuser","request":{"model":"openai-large","messages":[{"role":"user","content":"Hello, how are you?"}],"temperature":0.7},"response":{"content":"I am doing well, thank you for asking!","usage":{"total_tokens":25},"model":"openai-large"},"error":null}
```

## What Gets Logged

- **Request data**: model, messages, temperature, stream setting
- **Response data**: content, token usage, model used
- **Error data**: error message if request failed
- **Timestamp**: when the request was processed

## Files

- `userLogger.js` - Main logging functionality
- `user_logs/` - Directory containing individual user log files

## Security Notes

- Only logs authenticated users (requires `authResult.username`)
- Usernames are sanitized for filesystem safety
- No sensitive data like API keys are logged
- Only enable for debugging - logs can grow large over time
