# Testing Guide

This document provides information on how to run tests for the text.pollinations.ai project.

## Running Tests

### Run All Tests

To run all tests in the project:

```bash
npm test
```

### Run Unit Tests Only

To run only the unit tests (files directly in the test directory):

```bash
npm run test:unit
```

### Run Individual Test Files

To run a specific test file, use the test:file script:

```bash
# Using the test:file script (note the -- before the file path)
npm run test:file -- test/simpleFunctionCalling.test.js

# Using the test:file script for multiple files
npm run test:file -- test/simpleFunctionCalling.test.js test/toolCalls.test.js
```

### Run Tests Matching a Pattern

To run tests that match a specific pattern, use the test:pattern script:

```bash
# Run all tests with "function" in the filename
npm run test:pattern -- "**/function*.test.js"

# Run all tests with "tool" in the filename
npm run test:pattern -- "**/tool*.test.js"
```

## Test Timeouts

Tests that make API calls may take longer to complete. The timeout for these tests is set to 60-120 seconds in most integration test files using:

```javascript
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});
```

## Function Calling Tests

The project includes comprehensive tests for function calling with OpenAI compatible models:

### Basic Function Calling (simpleFunctionCalling.test.js)

This file demonstrates how to test basic function calling with OpenAI compatible models. It shows:

1. How to define function tools with the proper schema
2. How to pass tools and tool_choice parameters to the API
3. How to verify that the model called the function correctly

To run this test:

```bash
npm run test:file -- test/simpleFunctionCalling.test.js
```

### Comprehensive Tool Calls Tests (toolCalls.test.js)

This file provides more extensive tests for function calling, including:

1. **Basic function calling** - Testing the basic function calling capability
2. **Multiple function definitions** - Testing with multiple function tools defined
3. **Tool choice parameter** - Testing different tool_choice options (auto, none, required, specific function)
4. **Complex function parameters** - Testing with nested object parameters
5. **Different providers** - Testing with both OpenAI and OpenRouter (when available)

To run these tests:

```bash
npm run test:file -- test/toolCalls.test.js
```

To run all function calling related tests:

```bash
npm run test:pattern -- "**/tool*.test.js" "**/function*.test.js"
```

## Notes on Running Tests

- When using the test scripts, you need to include `--` before the file path or pattern to pass the argument to the npm script.
- The tests use environment variables from the `.env` file, so make sure it's properly configured.
- Some tests may be skipped if the required API keys are not available.
- For OpenAI function calling tests, you need AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.
- For OpenRouter function calling tests, you need OPENROUTER_API_KEY.