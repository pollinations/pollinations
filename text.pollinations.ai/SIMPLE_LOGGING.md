# Conversation Logging & Classification System

Complete solution to log conversations and classify them using LLM analysis based on OpenAI research.

## Files

- `simpleLogger.js` - Logs conversations (20% sample rate) to `user_logs/conversations.jsonl`
- `processLogs.js` - Enhanced script with LLM classification capabilities

## How it works

1. **Automatic logging**: 20% of conversations are saved to `user_logs/conversations.jsonl`
2. **Smart filtering**: Automatically excludes image data, base64 content, and non-meaningful messages
3. **Message truncation**: Each message is truncated to 280 characters (Twitter length) for efficient storage
4. **LLM Classification**: Run `node processLogs.js --classify` to analyze conversations with AI
5. **Education Focus**: Use `--education-focus` flag to highlight educational use cases

## Log format

Each line in `conversations.jsonl`:
```json
{
  "timestamp": "2025-01-17T10:30:45.123Z",
  "model": "gpt-4",
  "username": "user123",
  "messages": [
    {"role": "user", "content": "...last 280 chars of message", "original_length": 450},
    {"role": "assistant", "content": "Hi there!"}
  ],
  "total_messages": 5,
  "filtered_messages": 2,
  "max_chars_per_message": 280
}
```

## Classification Categories

Based on OpenAI research, conversations are classified by:

### 1. Work vs Non-Work
- Identifies work-related vs personal usage

### 2. Topic Classification
- **practical_guidance**: Tutoring, how-to advice, creative ideation
- **seeking_information**: Factual queries, current events, recipes
- **writing**: Content creation, editing, translation
- **technical_help**: Programming, math, data analysis
- **multimedia**: Image/media generation
- **self_expression**: Casual chat, relationships, games

### 3. Education Detection
- **tutoring_teaching**: Explaining concepts, helping with learning
- **academic_writing**: Homework, essays, research assistance
- **skill_development**: Learning new skills or knowledge
- **not_educational**: Other purposes

### 4. User Intent
- **asking**: Seeking information for decision-making
- **doing**: Requesting task completion
- **expressing**: No clear goal, just expressing

## Usage

```bash
# View logged conversations (basic info)
node processLogs.js

# Run full LLM classification analysis
node processLogs.js --classify

# Focus on educational conversations for affiliate analysis
node processLogs.js --classify --education-focus

# Check raw log file
tail user_logs/conversations.jsonl

# View classification results
tail user_logs/classification_results.jsonl
```

## Configuration

### Adjust Settings
To change the logging rate or message length, edit the constants at the top of `simpleLogger.js`:
```javascript
const SAMPLE_RATE = 0.2;           // 20% of conversations
const MAX_MESSAGES = 3;            // Last 3 messages per conversation  
const MAX_MESSAGE_CHARS = 280;     // Twitter length for efficient storage
```

### Education Research Mode
For your education affiliate research:
```bash
node processLogs.js --classify --education-focus
```

## Expected Results

Based on OpenAI research, you should expect:
- ~10% of conversations are tutoring/teaching related
- ~29% are practical guidance (includes education)
- ~24% are writing assistance (includes academic writing)
- Education use cases are significant and growing

Perfect for identifying opportunities for your education affiliate partner!

## Message Truncation Benefits

**Why 280 characters?**
- **Storage efficiency**: Dramatically reduces log file sizes
- **Privacy friendly**: Limits exposed content while preserving intent
- **Classification accuracy**: Research shows intent can be determined from short snippets
- **Twitter-proven**: 280 chars is proven sufficient for meaningful communication

**Smart truncation strategy**:
- Takes the **last** 280 characters (most recent/relevant content)
- Preserves the user's final intent/request
- Tracks original message length for analysis
- Adds "..." prefix to indicate truncation

**Example**:
```
Original (500 chars): "I've been working on this complex data analysis project for weeks and I'm struggling with the statistical methodology. I need help understanding how to properly implement a multiple regression analysis with categorical variables and interaction terms. Can you explain the step-by-step process?"

Truncated (280 chars): "...eed help understanding how to properly implement a multiple regression analysis with categorical variables and interaction terms. Can you explain the step-by-step process?"
```

The truncated version still clearly shows this is a **technical_help** request for **skill_development** - perfect for classification!

## Smart Content Filtering

**What gets filtered out:**
- **Image data**: Base64 encoded images, data URLs, image_url objects
- **Binary content**: Long base64 strings that aren't useful for intent analysis
- **Empty messages**: Null, undefined, or very short (< 3 chars) content
- **Non-text content**: Preserves only meaningful text from multimodal messages

**Why filtering matters:**
- **Storage efficiency**: Eliminates bloated logs with unnecessary binary data
- **Privacy**: Removes potentially sensitive image content
- **Classification accuracy**: Focuses on text that reveals user intent
- **Processing speed**: Smaller, cleaner data for LLM analysis

**Example filtering:**
```
Before: {"content": [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ..."}}, {"type": "text", "text": "What's in this image?"}]}

After: {"content": "What's in this image?", "original_length": 19}
```

The system automatically extracts only the meaningful text while preserving the user's intent!
