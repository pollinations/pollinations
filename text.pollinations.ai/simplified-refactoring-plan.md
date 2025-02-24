# Simplified Text Generation Refactoring Plan

## Core Principles
- Focus on simplicity and minimalism
- Make incremental improvements
- Prioritize testing
- Address the most critical DRY issues first

## Key DRY Issues to Address

1. **Error Handling**: Similar error handling code is repeated across modules
2. **Option Normalization**: Default values and option validation are duplicated
3. **Message Validation**: Basic message validation logic is repeated

## Minimal Utility Functions

Add just two key utility functions to `textGenerationUtils.js`:

```javascript
/**
 * Creates a standard error response object
 * @param {Error|Object} error - The error that occurred
 * @param {string} provider - The provider name
 * @returns {Object} - Standardized error response
 */
function createErrorResponse(error, provider) {
  return {
    error: {
      message: error.message || 'Unknown error',
      type: error.type || 'api_error',
      param: error.param,
      code: error.code,
      status: error.status || 500,
      provider
    }
  };
}

/**
 * Normalizes options with defaults
 * @param {Object} options - User options
 * @param {Object} defaults - Default options
 * @returns {Object} - Normalized options
 */
function normalizeOptions(options = {}, defaults = {}) {
  return { ...defaults, ...options };
}
```

## Incremental Implementation Approach

1. **Phase 1**: Update `textGenerationUtils.js` with minimal new functions
   - Add `createErrorResponse` and `normalizeOptions`
   - Run tests to ensure existing functions still work

2. **Phase 2**: Refactor one module as a proof of concept
   - Start with `generateDeepseek.js` as it's already being worked on
   - Use the new utility functions
   - Run tests to verify functionality

3. **Phase 3**: Apply the pattern to one more module
   - Choose `generateTextOpenai.js` as it's a core module
   - Apply the same pattern
   - Run tests to verify functionality

4. **Phase 4**: Evaluate results and decide on next steps
   - Review code improvements
   - Assess test results
   - Decide whether to continue with other modules

## Testing Focus

For each phase:

1. **Unit Tests**: Run specific tests for the modified module
   ```bash
   npx ava test/deepseek.integration.test.js
   ```

2. **Integration Tests**: Run integration tests to ensure end-to-end functionality
   ```bash
   npx ava test/integration.test.js
   ```

3. **Full Test Suite**: Run all tests to catch any regressions
   ```bash
   npm test
   ```

## Example Refactoring (DeepSeek)

### Before/After Comparison

**Before:**
```javascript
// Error handling
if (!apiKey) {
  return {
    error: {
      message: "DeepSeek API key not found. Please set DEEPSEEK_API_KEY environment variable.",
      type: "api_key_error",
      provider: "deepseek"
    }
  };
}
```

**After:**
```javascript
// Error handling
if (!apiKey) {
  return createErrorResponse(
    { message: "DeepSeek API key not found. Please set DEEPSEEK_API_KEY environment variable." },
    "deepseek"
  );
}
```

## Benefits of This Approach

1. **Minimal Changes**: Reduces risk of introducing bugs
2. **Incremental Improvement**: See benefits without a complete overhaul
3. **Focused Testing**: Ensures each change maintains functionality
4. **Clear Pattern**: Establishes a pattern that can be applied to other modules later

## Next Steps After Initial Refactoring

If the initial refactoring proves successful:

1. Apply the same pattern to other modules one at a time
2. Consider adding more utility functions if clear patterns emerge
3. Continue to prioritize testing with each change