# Unified Integration Testing Framework for Pollinations Services

This directory contains a unified testing framework for integration testing of Pollinations services. The framework is designed to be minimal, modern, and boilerplate-less, focusing on testing services from the outside without mocking.

## Overview

The framework provides:

1. **Service Management**: Utilities for starting and stopping services for testing
2. **Common Assertions**: Reusable assertions for API responses
3. **Helper Functions**: Utilities for common testing tasks
4. **Consistent Structure**: A standardized approach to writing integration tests

## Getting Started

### Installation

The framework is included in the repository and doesn't require separate installation. However, you'll need to install the required dependencies:

```bash
npm install
```

### Writing Tests

To write integration tests for a service:

1. Create a test file in the service's `test/integration` directory
2. Import the testing utilities from the shared framework
3. Use the `startService` function to start the service
4. Write tests that interact with the service's API

Example:

```javascript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startService, assertSuccessfulJsonResponse } from '../../../shared/testing/index.js';

describe('Service API Integration Tests', () => {
  let api;
  let stopService;
  
  beforeAll(async () => {
    const service = await startService({
      command: 'node start.js',
      cwd: './service-directory',
      port: 12000,
      readyPattern: 'Server started'
    });
    
    api = service.request;
    stopService = service.stop;
  });
  
  afterAll(async () => {
    if (stopService) {
      await stopService();
    }
  });
  
  it('should return a successful response', async () => {
    const response = await api.get('/endpoint');
    assertSuccessfulJsonResponse(response, expect);
  });
});
```

### Running Tests

To run all integration tests:

```bash
npm test
```

To run tests for a specific service:

```bash
npm run test:text   # Run text service tests
npm run test:image  # Run image service tests
```

To run tests in watch mode:

```bash
npm run test:watch
```

## Framework Components

### setup.js

Provides utilities for starting and stopping services:

- `startService`: Starts a service and returns a supertest instance
- `createTestServer`: Creates a mock server for testing

### assertions.js

Provides common assertions for API responses:

- `assertSuccessfulJsonResponse`: Asserts that a response is a successful JSON response
- `assertSuccessfulImageResponse`: Asserts that a response is a successful image response
- `assertErrorResponse`: Asserts that a response contains an error

### helpers.js

Provides helper functions for common testing tasks:

- `randomString`: Generates a random string for use in tests
- `wait`: Waits for a specified amount of time
- `retry`: Retries a function until it succeeds or times out
- `generateRandomSeed`: Generates a random seed for reproducible tests

## Best Practices

1. **Test from the outside**: Focus on testing the external API behavior
2. **No mocking**: Test the actual service behavior
3. **Isolation**: Each test should be independent and not rely on the state of other tests
4. **Clear assertions**: Use descriptive assertions that clearly indicate what's being tested
5. **Proper cleanup**: Always stop services after tests complete