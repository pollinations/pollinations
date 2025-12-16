# Authentication Integration Test for Reasoning Service

## Step 1: Start Authentication Flow

Run the simple auth test to get the authentication URL:

```bash
node test-simple-auth.js
```

This will generate:
- **Auth URL**: Visit this in your browser to authenticate with GitHub
- **Code Verifier**: Save this for token exchange
- **State**: Save this for token exchange

## Step 2: Complete GitHub Authentication

1. Visit the generated auth URL in your browser
2. Complete the GitHub OAuth flow
3. You'll be redirected to `http://localhost:3000/callback?code=XXX&state=YYY`
4. Copy the `code` parameter from the redirect URL

## Step 3: Exchange Code for Token

Once you have the authorization code, use it to get an access token:

```javascript
// Run this with your actual code and codeVerifier
const authTools = require('./src/services/authService.js').authTools;

const exchangeTool = authTools.find(tool => tool.name === 'exchangeToken');
const result = await exchangeTool.handler({
    code: 'YOUR_CODE_FROM_CALLBACK',
    codeVerifier: 'YOUR_SAVED_CODE_VERIFIER'
});

console.log('Access Token:', result.content[0].text.accessToken);
```

## Step 4: Test Reasoning with Authentication

Once you have an access token, the reasoning service will automatically use it:

```javascript
const reasoningTools = require('./src/services/reasoningService.js').reasoningTools;

const deepReasoningTool = reasoningTools.find(tool => tool.name === 'deep_reasoning');
const result = await deepReasoningTool.handler({
    prompt: "What are the implications of quantum computing for cryptography?",
    context: "Focus on both threats and opportunities"
});

console.log(result.content[0].text);
```

## Alternative: API Key Authentication

If you have a Pollinations API key, you can set it as an environment variable:

```bash
export POLLINATIONS_API_KEY="your-api-key-here"
```

The reasoning service will automatically use this for authentication.

## Testing the Integration

Run the comprehensive test:

```bash
node test-auth-integration.js
```

This will test:
1. Authentication status
2. Direct API calls with auth
3. Reasoning service with auth
4. Error handling for unauthenticated requests