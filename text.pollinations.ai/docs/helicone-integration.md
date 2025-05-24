# Helicone Integration for text.pollinations.ai

This document explains how the Helicone logging integration works with the existing Portkey gateway setup.

## Overview

The implementation routes requests through Helicone's proxy before they reach the Portkey gateway when Helicone logging is enabled. This sequential proxy approach allows us to:

1. Maintain the existing Portkey functionality
2. Add Helicone logging without additional code complexity
3. Toggle Helicone logging on/off with a simple environment variable
4. Preserve all the custom model configurations and routing logic

## Configuration

Helicone integration is configured through environment variables in `.env.helicone`:

```
# Helicone Configuration
HELICONE_ENABLED=true
HELICONE_API_KEY=your_helicone_api_key
```

- `HELICONE_ENABLED`: Set to `true` to enable Helicone logging, `false` to disable
- `HELICONE_API_KEY`: Your Helicone API key

## Implementation Details

The integration is implemented in `genericOpenAIClient.js` and follows these steps:

1. Check if Helicone is enabled via the `HELICONE_ENABLED` environment variable
2. If enabled, determine the appropriate Helicone proxy endpoint based on the provider:
   - OpenAI: `https://oai.hconeai.com/v1`
   - Anthropic: `https://anthropic.hconeai.com/v1`
   - Azure OpenAI: Uses the original endpoint with special Helicone headers
3. Add Helicone authentication and tracking headers:
   - `Helicone-Auth`: Authentication for Helicone
   - `Helicone-Property-Source`: Set to 'text.pollinations.ai'
   - `Helicone-Property-Model`: The model being used
   - `Helicone-User-Id`: User identifier (if available)
   - `Helicone-Property-Session-Id`: Session identifier (if available)
4. For Azure OpenAI models, add special headers:
   - `Helicone-OpenAI-Api-Base`: The base Azure OpenAI endpoint
   - `Helicone-Azure-Deployment-Id`: The deployment name

## Provider-Specific Handling

### Azure OpenAI Models

For Azure OpenAI models, the implementation:
1. Extracts the deployment name from the endpoint URL
2. Adds Azure-specific Helicone headers
3. Keeps the original Azure endpoint URL (doesn't route through Helicone proxy)

### Anthropic Models

For Anthropic models, the implementation:
1. Routes requests through the Anthropic-specific Helicone proxy
2. Preserves all Anthropic-specific headers and parameters

### Other Providers

For other providers like Cloudflare, Scaleway, etc., the implementation:
1. Routes requests through the standard Helicone OpenAI proxy
2. Preserves all provider-specific headers and parameters

## Testing

A test suite is available in `test/helicone-integration.test.js` to verify the integration works correctly:

```bash
# Run the Helicone integration tests
npm test -- -g "Helicone Integration"
```

## Fallback Behavior

If Helicone is unavailable or encounters an error, the system will continue to function normally by:

1. Logging the error but not failing the request
2. Continuing to route requests through Portkey as usual

## Monitoring and Analytics

To view the logged data and analytics:

1. Log in to the Helicone dashboard
2. Filter requests by the `source` property set to "text.pollinations.ai"
3. View detailed analytics by model, user, or session

## Troubleshooting

If you encounter issues with the Helicone integration:

1. Check that `HELICONE_ENABLED` is set to `true`
2. Verify that `HELICONE_API_KEY` is valid
3. Check the logs for any error messages related to Helicone
4. Temporarily disable Helicone by setting `HELICONE_ENABLED=false` to isolate the issue
