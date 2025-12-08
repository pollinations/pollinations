# Redirect URL and Session-Based API Key Feature

## Overview

This implementation adds support for external applications to redirect users to enter.pollinations.ai for authentication, and then return them to the originating application with their session credentials.

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
4. When clicked, the user is redirected back to the original URL with a `session_id` parameter

### 2. Session ID in Redirect

When the user clicks "Return to app", they are redirected to:

```
https://example.com/callback?session_id={session_id}
```

The receiving application can use this `session_id` to obtain an API key.

### 3. Session-Based API Key Endpoint

A new endpoint `/api/auth/session-key` allows applications to exchange a session for a temporary API key:

**Endpoint:** `GET /api/auth/session-key`

**Authentication:** Requires valid session cookie (`better-auth.session_token`)

**Response:**
```json
{
  "key": "plln_pk_xxxxxxxxxxxxxxxx",
  "keyId": "key-id",
  "name": "Auto-generated Session Key",
  "type": "publishable"
}
```

The endpoint:
- Returns an existing publishable API key if one exists
- Creates a new publishable key if none exists
- Stores the plaintext key in metadata for future retrieval
- Only works with session-based authentication (not API key auth)

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
   const sessionId = params.get('session_id');
   
   if (sessionId) {
     // User authenticated, fetch API key using session
     // Note: You'll need to handle the session cookie transfer
   }
   ```

3. **Get API key from session:**
   ```javascript
   // This requires the session cookie to be present
   const response = await fetch('https://enter.pollinations.ai/api/auth/session-key', {
     credentials: 'include'
   });
   const { key } = await response.json();
   
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
   - Displays "Return to {hostname}" button with favicon
   - Adds `session_id` to redirect URL when returning to app
   - Clears localStorage after redirect

3. **src/routes/session-key.ts** (new)
   - New API endpoint for session-to-API-key conversion
   - Returns or creates publishable API key
   - Requires session-based authentication

4. **src/index.ts**
   - Registers the new `/api/auth/session-key` route

## Security Considerations

- The session-key endpoint only works with session cookies, not API keys
- Only publishable keys (plln_pk) are returned, not secret keys (plln_sk)
- The plaintext key is stored in metadata for retrieval
- Redirect URL is validated as a proper URL before use
- Session ID is obtained from the authentication system, not user input

## Testing

Integration tests have been added in `test/integration/session-key.test.ts`:

- Test creating a new API key from session
- Test returning existing API key
- Test authentication requirement (401 for unauthenticated requests)

Run tests with:
```bash
npm test -- session-key.test.ts
```

## Future Improvements

1. Add expiration time to auto-generated API keys
2. Support for custom redirect parameters
3. Better handling of cross-origin session cookies
4. Rate limiting on the session-key endpoint
