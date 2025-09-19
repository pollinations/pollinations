# Conversation Logging System

This folder contains all conversation logging functionality for the Pollinations text service.

## Structure

### Core Logging Modules
- **`simpleLogger.js`** - Simple conversation logging with sampling (currently 100% rate)
  - Logs conversations to `user_logs/conversations.jsonl`
  - Configurable sample rate and message limits
  - User exclusion list for privacy
  - Used by main server for general conversation logging

- **`userLogger.js`** - Specific user request/response logging
  - Environment variable `DEBUG_USERS` controls which users to log
  - Supports comma-separated usernames or "all" for all users
  - Logs stored in `user_logs/[username].log` with detailed request/response data
  - Used for debugging specific user issues

### Processing & Analysis
- **`processors/`** - Log processing and classification scripts
  - `processLogs.js` - Enhanced conversation log processor with LLM classification
  - Classifies conversations by topic, intent, work-related, education, language learning
  - Uses p-queue for rate limiting API calls
  - Supports command-line usage with `--file=path/to/file.jsonl`

- **`analysis/`** - Temporary analysis files (gitignored)
  - Development scripts for testing classification accuracy
  - Sample data files for validation
  - Not included in version control

## Usage

### Simple Conversation Logging
```javascript
import { logConversation } from "./logging/simpleLogger.js";

// Log a conversation (subject to sampling rate)
logConversation(messages, model, username);
```

### User-Specific Logging
```javascript
import { logUserRequest } from "./logging/userLogger.js";

// Log specific user request/response
logUserRequest(username, requestData, response, error, queueInfo, processingTimeMs);
```

### Log Processing
```bash
# Process all conversations
node logging/processors/processLogs.js

# Process specific file
node logging/processors/processLogs.js --file=sample.jsonl
```

## Configuration

### Environment Variables
- `DEBUG_USERS` - Comma-separated list of usernames to log, or "all"
- `SAMPLE_RATE` - Configured in simpleLogger.js (currently 1.0 = 100%)

### User Exclusions
Specific users can be excluded from simple conversation logging for privacy:
- Configured in `simpleLogger.js` EXCLUDED_USERS array
- Currently excludes: p0llinati0ns, sketork, YoussefElsafi, wBrowsqq

## Log Files Location
- **General conversations**: `user_logs/conversations.jsonl`
- **User-specific logs**: `user_logs/[username].log`
- **Classification results**: `user_logs/classification_results.jsonl`
- **Language learning conversations**: `user_logs/language_learning_conversations.jsonl`

## Recent Improvements
- Fixed language learning over-classification (50% → 2% false positive rate)
- Enhanced classification prompts for better accuracy
- Organized file structure for better maintainability
- Added comprehensive analysis and debugging tools
