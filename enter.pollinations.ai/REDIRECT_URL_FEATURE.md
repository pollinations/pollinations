# Redirect URL and Secret-Based API Key Feature

## Overview

This implementation adds support for external applications to redirect users to enter.pollinations.ai for authentication, and then return them to the originating application with a secure secret to obtain API credentials.

## Features

### 1. Redirect URL Parameter

Applications can now redirect users to enter.pollinations.ai with a `redirect_url` query parameter:

```
https://enter.pollinations.ai/sign-in?redirect_url=https://example.com/callback
```

When the user signs in:
1. The `redirect_url` is stored in localStorage
2. After successful authentication, a "Return to {hostname}" button appears on the dashboard
3. The button includes the favicon of the destination site
4. When clicked, a secure secret is generated and the user is redirected back to the original URL with the secret

### 2. Secret in Redirect

When the user clicks "Return to app", they are redirected to:

```
https://example.com/callback?secret={64-char-hex-secret}
```

The receiving application can use this one-time `secret` to obtain an API key.

### 3. Secret-Based API Key Endpoint

A new endpoint `/api/auth/api-key` allows applications to exchange a secret for an API key:

**Endpoint:** `GET /api/auth/api-key?secret={secret}`

**Authentication:** Requires the secret parameter obtained from the redirect

**Response:**
```json
{
  "key": "plln_sk_xxxxxxxxxxxxxxxx",
  "keyId": "key-id",
  "name": "Redirect API Key",
  "type": "secret"
}
```

The endpoint:
- Validates the secret parameter (64-character hex string)
- Looks up the session from the secret-to-session mapping in KV storage
- Creates a new secret API key (plln_sk_) for the user
- Deletes the secret after use (single-use only)
- Expires unused secrets after 5 minutes

## Usage Flow

### For External Applications

1. **Redirect to enter.pollinations.ai:**
   ```javascript
   window.location.href = 'https://enter.pollinations.ai/sign-in?redirect_url=' + 
     encodeURIComponent(window.location.origin + '/auth-callback');
   ```

2. **Handle the callback:**
   ```javascript
   // On your auth-callback page
   const params = new URLSearchParams(window.location.search);
   const secret = params.get('secret');
   
   if (secret) {
     // User authenticated, fetch API key using the secret
     const response = await fetch(`https://enter.pollinations.ai/api/auth/api-key?secret=${secret}`);
     const { key } = await response.json();
     
     // Store the key securely
     localStorage.setItem('api_key', key);
   }
   ```

3. **Use the API key:**
   ```javascript
   // Use the key for gen.pollinations.ai
   const image = await fetch('https://gen.pollinations.ai/image/a%20cat?key=' + key);
   ```

## Implementation Details

### Files Modified

1. **src/client/routes/sign-in.tsx**
   - Added `redirect_url` query parameter validation
   - Stores redirect URL in localStorage on component mount

2. **src/client/routes/index.tsx**
   - Reads redirect URL from localStorage
   - Generates a secure 64-character hex secret
   - Stores the secret-to-session mapping via `/api/auth/api-key/store-redirect-secret`
   - Redirects back with the secret parameter
   - Displays "Return to {hostname}" button with favicon
   - Clears localStorage after redirect

3. **src/routes/api-key.ts** (new, renamed from session-key.ts)
   - POST `/api/auth/api-key/store-redirect-secret` - Stores secret-to-session mapping in KV
   - GET `/api/auth/api-key?secret={secret}` - Creates and returns secret API key
   - Validates secret format (64-character hex)
   - Single-use secrets with 5-minute expiration

4. **src/index.ts**
   - Registers the new `/api/auth/api-key` route

## Security Considerations

- Secret is a 64-character cryptographically random hex string
- Secrets are single-use and deleted after retrieval
- Secrets expire after 5 minutes if unused
- Secret keys (plln_sk) are returned, providing full API access
- Redirect URL is validated as a proper URL before use
- Secret-to-session mapping stored in KV with TTL

## Testing

Integration tests have been added in `test/integration/api-key.test.ts`:

- Test creating a new API key with valid secret
- Test rejecting invalid secrets (401)
- Test authentication requirement for storing secrets (401)

Run tests with:
```bash
npm test -- api-key.test.ts
```

## Future Improvements

1. Add domain allowlist for redirect URL validation
2. Support for custom redirect parameters
3. Rate limiting on the api-key endpoints
4. Webhook for external app to receive key (instead of URL parameter)
