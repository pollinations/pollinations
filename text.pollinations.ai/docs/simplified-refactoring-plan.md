# Simplified Text Generation Refactoring Plan

## Core Principles
- Focus on simplicity and minimalism
- Make incremental improvements
- Prioritize testing
- Address the most critical DRY issues first

## Key DRY Issues to Address

1. **Common API Client Pattern**: Many modules use fetch to call OpenAI-compatible APIs
2. **Error Handling**: Similar error handling code is repeated across modules
3. **Option Normalization**: Default values and option validation are duplicated
4. **Message Validation**: Basic message validation logic is repeated

## Approach: Generic OpenAI-compatible Client

Create a generic client function that can be configured for different providers:
- Takes configuration parameters (endpoint, auth, models, etc.)
- Returns a function that handles the common API request pattern
- Manages error handling, option normalization, and response formatting

## Incremental Implementation Approach

1. **Phase 1**: Create the generic OpenAI-compatible client
   - Create a new utility file with minimal functionality
   - Design it to be configurable for different providers

2. **Phase 2**: Refactor one module as a proof of concept
   - Start with DeepSeek as it's already been partially refactored
   - Convert it to use the generic client
   - Run tests to verify functionality

3. **Phase 3**: Apply the pattern to one more module
   - Choose Gemini as it follows a similar pattern
   - Apply the same approach
   - Run tests to verify functionality

4. **Phase 4**: Evaluate results and decide on next steps
   - Review code improvements
   - Assess test results
   - Decide whether to continue with other modules

## Testing Focus

For each phase:

1. **Unit Tests**: Run specific tests for the modified module
2. **Integration Tests**: Run integration tests to ensure end-to-end functionality
3. **Full Test Suite**: Run all tests to catch any regressions

## Benefits of This Approach

1. **Reduced Duplication**: Common patterns extracted to a single place
2. **Easier Maintenance**: Changes to common behavior only need to be made once
3. **Consistent Behavior**: All providers handle errors, options, etc. in the same way
4. **Simplified Provider Implementation**: New providers can be added with minimal code

## Next Steps After Initial Refactoring

If the initial refactoring proves successful:
1. Apply the same pattern to other modules one at a time
2. Consider special handling for providers with unique requirements
3. Continue to prioritize testing with each change