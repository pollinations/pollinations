# Minimal Testing Approach

## Testing Philosophy

- Test each change immediately
- Focus on existing tests first
- Verify both success and error cases
- Keep it simple and incremental

## Testing Steps

### 1. Before Changes

- Run specific tests to establish baseline
- Note any existing issues or test failures
- Document expected behavior

### 2. After Generic Client Creation

- Test the client with simple configurations
- Verify it handles basic success and error cases
- Ensure it maintains the same response format

### 3. After Module Refactoring

- Test the specific module (DeepSeek, Gemini)
- Run integration tests
- Run full test suite

## Test Focus Areas

### 1. Error Handling

- Missing API keys
- Invalid requests
- Network errors
- API errors (4xx, 5xx responses)

### 2. Option Handling

- Default values applied correctly
- User options override defaults
- Special options (jsonMode, tools, etc.)

### 3. API Responses

- Same response structure as before
- Correct handling of different model responses
- Proper formatting of error responses

## Handling Test Failures

### 1. Compare Before/After

- Look at response structures
- Check for subtle differences
- Verify error handling

### 2. Isolate the Issue

- Test specific functions
- Use logging for debugging
- Check configuration parameters

### 3. Revert if Necessary

- Keep original code as reference
- Be prepared to roll back changes
- Document issues for future attempts

## Success Criteria

- All tests pass
- Code is cleaner and more consistent
- Error handling is standardized
- No change in external behavior

## Next Steps

After successful refactoring of initial modules, continue with other modules one at a time, always with thorough testing after each change.