# Pollinations LLM Observability

This directory contains the tooling for monitoring and analyzing LLM API calls made by the text.pollinations.ai service.

## Components

- **tinybirdTracker.js**: Main utility for sending telemetry events to Tinybird's Event API
- **testTinybird.js**: CLI tool for testing the Tinybird integration manually

## Configuration

All required environment variables are stored in the main `.env` file in the project root:

```
TINYBIRD_API_URL=https://api.europe-west2.gcp.tinybird.co
TINYBIRD_API_KEY=p.your-tinybird-api-key
```

## Usage

The telemetry tracking is automatically integrated into `genericOpenAIClient.js` which captures:

- Request/response timestamps
- Model and provider information
- Token usage (prompt, completion, total)
- Success/error status
- Duration metrics
- Message content (truncated)

## Dashboard

The LLM telemetry data can be visualized using the hosted Tinybird dashboard:

```bash
# Get your read_pipes token
tb --cloud token copy read_pipes

# Open the hosted dashboard with your token
open https://llm-tracker.tinybird.live?token=YOUR_TOKEN_HERE
```

## Implementation Details

The telemetry events are sent asynchronously after each LLM API call completes. This ensures that tracking doesn't impact the performance of the main application functionality.

Errors in telemetry sending are caught and logged but don't affect the main application flow.
