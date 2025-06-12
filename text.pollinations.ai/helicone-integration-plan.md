# Helicone Integration Plan for text.pollinations.ai

This document outlines a detailed implementation plan for integrating Helicone logging with the existing Portkey gateway setup using a parallel proxy approach.

## Overview

The implementation will route requests through Helicone's proxy before they reach the Portkey gateway when Helicone logging is enabled. This approach allows us to:

1. Maintain the existing Portkey functionality
2. Add Helicone logging without additional code complexity
3. Toggle Helicone logging on/off with a simple environment variable
4. Preserve all the custom model configurations and routing logic

## Files to Modify

### 1. `/home/ubuntu/pollinations/text.pollinations.ai/.env`

Add Helicone-related environment variables:

```
# Helicone Configuration
HELICONE_ENABLED=true
HELICONE_API_KEY=your_helicone_api_key
```

### 2. `/home/ubuntu/pollinations/text.pollinations.ai/genericOpenAIClient.js`

This is the core file that needs modification to implement the parallel proxy approach. We need to:

- Modify the fetch call to route through Helicone when enabled
- Add Helicone-specific headers to requests
- Ensure proper authentication for both Helicone and the target API

### 3. `/home/ubuntu/pollinations/text.pollinations.ai/portkeyUtils.js`

This file contains helper functions for generating Portkey headers. We need to ensure that any custom headers are preserved when routing through Helicone.

## Implementation Details

### Changes to genericOpenAIClient.js

The main changes will be in the `createOpenAICompatibleClient` function, specifically:

1. Check if Helicone is enabled via environment variable
2. If enabled, modify the endpoint URL to route through Helicone
3. Add Helicone authentication and tracking headers
4. Preserve all existing Portkey headers and functionality

### Helicone Header Strategy

When Helicone is enabled, we'll add the following headers:

- `Helicone-Auth`: Authentication for Helicone
- `Helicone-Property-Source`: Set to 'text.pollinations.ai'
- `Helicone-Property-Model`: The model being used
- `Helicone-User-Id`: User identifier (if available)
- `Helicone-Property-Session-Id`: Session identifier (if available)

### Configuration for Different Models

For each model type in the Portkey configuration, we need to ensure the proper routing through Helicone:

- OpenAI/Azure models: Route through the standard Helicone OpenAI proxy
- Anthropic models: Route through Helicone's Anthropic proxy endpoint
- Other providers: Use provider-specific Helicone endpoints where available

## Testing Strategy

1. Create a feature flag to enable/disable Helicone logging
2. Test with a simple request to verify logging works in Helicone dashboard
3. Test with different model configurations to ensure all routes work correctly
4. Validate that streaming responses are correctly logged
5. Ensure error responses are properly captured

## Integration Steps

1. Add environment variables for Helicone
2. Implement the parallel proxy logic in genericOpenAIClient.js
3. Test with a single model configuration
4. Gradually enable for all model configurations
5. Monitor for any performance impact or errors
6. Implement any provider-specific adjustments needed

## Considerations for Specific Model Types

### Azure OpenAI Models

For Azure OpenAI models, the current configuration in `portkeyConfig` includes:

- Azure API key
- Azure endpoint
- Model name

When routing through Helicone, we'll need to ensure these Azure-specific details are preserved.

### Cloudflare Models

The Cloudflare models use a custom host configuration. We'll need to ensure Helicone properly proxies to these custom hosts.

### Vertex AI Models

For Google Vertex AI models, we'll need to ensure that the authentication with Google Cloud works correctly when routed through Helicone.

## Fallback Strategy

In case of issues with the Helicone proxy:

1. Implement a circuit breaker pattern to detect Helicone failures
2. Automatically fall back to direct Portkey routing if Helicone is unavailable
3. Log any failures to help diagnose issues

## User Information Tracking

To maximize the value of Helicone's analytics:

1. Identify opportunities to add user-specific tracking via Helicone headers
2. Consider how to track session information across multiple requests
3. Add custom properties for specific use cases or features

## Performance Considerations

1. Monitor latency impact of adding the Helicone proxy
2. Consider implementing timeout configurations specific to Helicone
3. Evaluate the impact on response times for different model providers

## Resources

- [Helicone Documentation](https://docs.helicone.ai/)
- [Helicone Proxy Configuration](https://docs.helicone.ai/getting-started/integration-method/openai-proxy)
- [Helicone Custom Headers](https://docs.helicone.ai/features/custom-properties)
