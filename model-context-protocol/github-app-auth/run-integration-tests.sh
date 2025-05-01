#!/bin/bash
# Integration test script for GitHub App authentication
# Following the "thin proxy" design principle with minimal setup

# Create a log directory
mkdir -p logs

# Set environment variables for testing
export GITHUB_CLIENT_ID="test-client-id"
export GITHUB_CLIENT_SECRET="test-client-secret"
export GITHUB_APP_ID="test-app-id"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAtest
-----END RSA PRIVATE KEY-----"
export REDIRECT_URI="http://localhost:8787/callback"

# Initialize the database with schema
echo "Initializing database with schema..."
npx wrangler d1 execute github_auth --local --file=schema.sql

# Start the server in the background with output redirected to a log file
echo "Starting Cloudflare Worker server..."
npx wrangler dev --port 8787 --log-level debug > logs/server.log 2>&1 &
SERVER_PID=$!

echo "Server started with PID: $SERVER_PID"

# Check if the server process is running
if ps -p $SERVER_PID > /dev/null; then
  echo "Server process is running with PID: $SERVER_PID"
else
  echo "Failed to start server process"
  exit 1
fi

# Wait for server to start and check if it's responding
echo "Waiting for server to start..."
MAX_RETRIES=10
RETRY_COUNT=0
SERVER_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SERVER_READY" = false ]; do
  echo "Checking if server is ready (attempt $((RETRY_COUNT+1))/$MAX_RETRIES)..."
  
  # Try to connect to the server
  if curl -s http://localhost:8787/health > /dev/null; then
    echo "Server is ready!"
    SERVER_READY=true
  else
    echo "Server not ready yet, waiting..."
    RETRY_COUNT=$((RETRY_COUNT+1))
    sleep 2
  fi
done

if [ "$SERVER_READY" = false ]; then
  echo "Server failed to start after $MAX_RETRIES attempts"
  echo "Server log:"
  cat logs/server.log
  
  # Kill the server process if it's still running
  if ps -p $SERVER_PID > /dev/null; then
    echo "Killing server process..."
    kill $SERVER_PID
  fi
  
  exit 1
fi

# Run the tests with verbose output
echo "Running integration tests..."
VITEST_LOG_LEVEL=debug npx vitest run --config tests/vitest.config.ts --reporter verbose > logs/test.log 2>&1

# Capture the exit code
TEST_EXIT_CODE=$?

# Display test logs
echo "Test log:"
cat logs/test.log

# Kill the server
echo "Stopping server..."
kill $SERVER_PID

# Check if server was killed successfully
if ps -p $SERVER_PID > /dev/null; then
  echo "Server process is still running, force killing..."
  kill -9 $SERVER_PID
else
  echo "Server process stopped successfully"
fi

# Display server logs
echo "Server log:"
cat logs/server.log

# Exit with the test exit code
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Tests passed successfully!"
else
  echo "❌ Tests failed."
fi

exit $TEST_EXIT_CODE
