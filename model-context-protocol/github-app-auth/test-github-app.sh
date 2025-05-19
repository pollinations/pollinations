#!/bin/bash
# Simple test script for GitHub App authentication integration tests
# Following the "thin proxy" design principle with minimal setup

# Set environment variables for testing
export GITHUB_CLIENT_ID="test-client-id"
export GITHUB_CLIENT_SECRET="test-client-secret"
export GITHUB_APP_ID="test-app-id"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAtest
-----END RSA PRIVATE KEY-----"
export REDIRECT_URI="http://localhost:8787/callback"

# Run the tests with Vitest
echo "Running GitHub App authentication tests..."
npx vitest run tests/github-app.test.ts

# Check the exit code
if [ $? -eq 0 ]; then
  echo "✅ Tests passed successfully!"
else
  echo "❌ Tests failed."
fi
