# Portkey Gateway Integration

This document explains how to use the Portkey AI Gateway with the text.pollinations.ai API to access multiple LLM providers through a single, unified interface.

## Overview

Portkey AI Gateway is a lightweight, open-source solution that lets you route to 250+ LLMs with a single fast and friendly API. The integration we've created allows the text.pollinations.ai service to connect to a locally running Portkey gateway, providing access to models from various providers like OpenAI, Anthropic, Mistral, Meta, and more.

## Setup Instructions

### 1. Install and Run the Portkey Gateway

```bash
# Install and run the Portkey gateway locally
npx @portkey-ai/gateway
```

This will start the Portkey gateway on http://localhost:8787/v1

### 2. Configure Environment Variables

Add the following to your `.env` file:

```
# Portkey API Configuration
PORTKEY_API_KEY=your_portkey_api_key_here
PORTKEY_PROVIDER=openai  # Default provider (optional)
```

Notes:
- `PORTKEY_API_KEY`: This is your provider's API key (e.g., OpenAI, Anthropic) that Portkey will forward
- `PORTKEY_PROVIDER`: (Optional) Default provider to use. Supported values include: openai, anthropic, mistral, google, etc.

### 3. Provider-Specific API Keys

You'll need to have valid API keys for any providers you want to use through Portkey. The Portkey gateway will forward your API key to the selected provider.

## Available Models

The following models are available through the Portkey integration:

| Model Name | Description | Provider |
|------------|-------------|----------|
| portkey-gpt4 | GPT-4 via local Portkey gateway | OpenAI |
| portkey-claude | Claude 3 Opus via local Portkey gateway | Anthropic |
| portkey-llama | Llama 3 70B via local Portkey gateway | Meta |
| portkey-mistral | Mistral Large via local Portkey gateway | Mistral |

## Using the API

You can use these models like any other model in the text.pollinations.ai API:

```javascript
// Example using fetch
fetch('http://localhost:16385/openai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'portkey-gpt4',
    messages: [
      { role: 'user', content: 'Hello, who are you?' }
    ],
    temperature: 0.7
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## AWS Bedrock Native Provider

Claude models (Opus, Sonnet) use Portkey's native AWS Bedrock provider for direct access without intermediate proxies.

### IAM User Setup

The `portkey-bedrock-access` IAM user provides credentials for Portkey to access Bedrock:

```bash
# Create IAM user
aws iam create-user --user-name portkey-bedrock-access

# Attach Bedrock full access policy
aws iam attach-user-policy --user-name portkey-bedrock-access \
  --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess

# Create access keys (save these securely!)
aws iam create-access-key --user-name portkey-bedrock-access
```

### Environment Variables

Add to `.env` (or SOPS-encrypted `secrets/env.json`):

```
AWS_ACCESS_KEY_ID=<access-key-from-above>
AWS_SECRET_ACCESS_KEY=<secret-key-from-above>
AWS_REGION=us-east-1
```

### Supported Models

| Model | Bedrock Model ID |
|-------|------------------|
| claude-large | global.anthropic.claude-opus-4-5-20251101-v1:0 |
| claude-sonnet-4 | us.anthropic.claude-sonnet-4-20250514-v1:0 |
| claude-sonnet-4.5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |

### Benefits vs Fargate Proxy (Deprecated)

- ✅ Supports array content in messages
- ✅ Supports `cache_control` for Anthropic prompt caching
- ✅ Lower latency (direct to Bedrock)
- ✅ No extra infrastructure to maintain

## Advanced Configuration

### Model Mapping

The Portkey integration includes mappings for common models from various providers. You can extend this mapping in the `generateTextPortkey.js` file if you need additional models.

### Retries and Fallbacks

Portkey supports advanced features like automatic retries and fallbacks. These are configured using headers in the request:

- `x-portkey-retry`: Number of retry attempts (default: 3)
- `x-portkey-provider`: Override the default provider

## Testing

A test suite is provided in `test/portkey.integration.test.js` to verify the integration is working correctly. Run it with:

```bash
npm run test:pattern "test/portkey.integration.test.js"
```

## Troubleshooting

### Common Issues

1. **Connection Errors**: Ensure the Portkey gateway is running at http://localhost:8787
2. **Authentication Errors**: Verify your API keys are correctly set in the `.env` file
3. **Model Not Found**: Check that the model name is correctly specified and supported by the provider

### Debug Logs

Enable debug logs to see detailed information:

```bash
DEBUG=pollinations:portkey* npm run start
```

## Further Resources

- [Portkey Documentation](https://portkey.ai/docs/introduction/what-is-portkey)
- [Supported Models](https://portkey.ai/docs/api-reference/models)
- [Portkey GitHub Repository](https://github.com/Portkey-AI/gateway)