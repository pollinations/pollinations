# Pollinations LLM Observability

This directory contains the tooling for monitoring and analyzing LLM API calls made by the text.pollinations.ai service.

## Components

- **tinybirdTracker.js**: Main utility for sending telemetry events to Tinybird's Event API
- **testTinybird.js**: CLI tool for testing the Tinybird integration manually

## Configuration

The Tinybird telemetry is optional and will not affect the core functionality if not configured. Environment variables can be stored in the main `.env` file in the project root:

```
# Optional: Tinybird telemetry configuration
TINYBIRD_API_URL=https://api.europe-west2.gcp.tinybird.co  # Optional, defaults to EU endpoint
TINYBIRD_API_KEY=p.your-tinybird-api-key                  # Optional, telemetry will be skipped if not set
```

## Usage

The telemetry tracking is automatically integrated into `genericOpenAIClient.js` which captures:

- Request/response timestamps
- Model and provider information
- Token usage (prompt, completion, total)
- Success/error status
- Duration metrics
- No message content (excluded for privacy)

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
