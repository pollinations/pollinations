# Integration Tests for Pollinations MCP Server

This directory contains integration tests for the Pollinations MCP server using Vitest.

## Setup

To run the integration tests, you need to install the required dependencies:

```bash
npm install --save-dev vitest typescript @types/node
```

## Running Tests

You can run the integration tests using the following npm script:

```bash
npm run test:integration
```

Or to run in watch mode (tests will re-run when files change):

```bash
npm run test:integration:watch
```

## Test Structure

The integration tests use the following approach:

1. Start the MCP server as a child process
2. Connect to the server using the StdioClientTransport from the MCP SDK
3. Run tests against the server's API
4. Clean up by closing the client connection and killing the server process

## Adding New Tests

To add a new integration test:

1. Create a new file in the `tests/integration` directory with a `.test.js` extension
2. Follow the pattern in the existing tests:
   - Use `beforeAll` to set up the server and client
   - Use `afterAll` to clean up resources
   - Write test cases using `it` blocks

Example:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// ... other imports

describe('My New Integration Test', () => {
  let serverProcess;
  let client;
  
  beforeAll(async () => {
    // Set up server and client
  });
  
  afterAll(async () => {
    // Clean up
  });
  
  it('should test some functionality', async () => {
    // Test code here
  });
});
```
