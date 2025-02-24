# Minimal Refactoring Approach

## Core DRY Issues

1. **Common API Pattern**: Most providers follow the OpenAI API pattern
2. **Repeated Error Handling**: Each module has similar error handling code
3. **Option Normalization**: Default values are set in similar ways across modules
4. **Message Validation**: Similar message validation in each module

## Refactoring Strategy

### 1. Create a Generic Client

- Design a configurable client for OpenAI-compatible APIs
- Accept provider-specific settings (endpoint, auth, models)
- Handle common patterns (validation, requests, errors)

### 2. Refactor One Module First (DeepSeek)

- Convert to use the generic client
- Keep provider-specific logic separate
- Maintain the same external interface
- Run tests to verify functionality

### 3. Refactor One More Module (Gemini)

- Apply the same pattern
- Verify with tests
- Compare the implementations for consistency

### 4. Evaluate and Decide

- Review improvements in code clarity and DRY
- Assess performance and reliability
- Decide whether to continue with other modules

## Testing Strategy

1. **For Each Change**:
   - Run specific tests for the modified module
   - Run integration tests
   - Run full test suite

2. **Key Test Areas**:
   - Error handling
   - Option normalization
   - API response formatting
   - Edge cases (missing API keys, network errors)

## Benefits

1. **Cleaner Code**: Reduced duplication
2. **Consistent Error Handling**: Standardized error responses
3. **Easier Maintenance**: Common patterns in one place
4. **Simplified Provider Implementation**: New providers easier to add

## Next Steps

If successful, gradually apply the same pattern to other modules, always with thorough testing after each change.