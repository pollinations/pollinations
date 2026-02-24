# BYOP Implementation for chat.pollinations.ai

## Overview

This document describes the implementation of Bring Your Own Pollen (BYOP) authentication for the chat.pollinations.ai application.

## What Changed

### 1. New Hook: `useAuth.js`

Created `/apps/chat/src/hooks/useAuth.js` - A React hook that manages BYOP authentication:

- **Storage**: Stores user's API key in `localStorage` under key `pollinations_api_key`
- **URL Fragment Handling**: Automatically extracts `api_key` from URL hash fragment when redirected from `enter.pollinations.ai`
- **Login Flow**: Redirects users to `https://enter.pollinations.ai/authorize?redirect_url=<current_url>`
- **Logout**: Clears the stored API key
- **Default Fallback**: Uses default publishable key when no user key is present

### 2. Updated API Module: `api.js`

Modified `/apps/chat/src/utils/api.js` to support dynamic API keys:

**Key Changes:**
- Renamed `API_TOKEN` to `DEFAULT_API_TOKEN` (constant)
- Added `currentApiToken` variable to track the active token
- Added `setApiToken(token)` function to update the token dynamically
- Added `getApiToken()` function to retrieve current token
- Updated all API calls to use `currentApiToken` instead of hardcoded `API_TOKEN`
- Clear models cache when token changes to reload with new permissions

**Affected Functions:**
- `loadModels()` - Uses current token for fetching models
- `sendMessage()` - Uses current token for chat completions
- `generateImage()` - Uses current token for image generation
- `generateVideo()` - Uses current token for video generation

### 3. Updated App Component: `App.jsx`

Modified `/apps/chat/src/App.jsx` to integrate BYOP:

**Changes:**
- Imported `useAuth` hook and `setApiToken` function
- Added BYOP authentication state using `useAuth()`
- Added effect to update API token when user logs in/out
- Pass auth props (`isLoggedIn`, `apiKey`, `login`, `logout`) to Sidebar

### 4. Updated Sidebar Component: `Sidebar.jsx`

Modified `/apps/chat/src/components/Sidebar.jsx` to display auth UI:

**Added Props:**
- `isLoggedIn` - Boolean indicating if user has their own API key
- `apiKey` - Current API key (for display purposes)
- `onLogin` - Callback to initiate login flow
- `onLogout` - Callback to disconnect and remove API key

**New UI Section:**
```jsx
<div className="sidebar-auth-section">
  {isLoggedIn ? (
    // Shows: "🌸 Your Pollen" with truncated key + Disconnect button
  ) : (
    // Shows: "Connect with Pollinations" button
  )}
</div>
```

### 5. New Styles: `Sidebar.css`

Added CSS for the auth section:

- `.sidebar-auth-section` - Container with top border
- `.sidebar-auth-info` - Green-tinted info box showing user's key
- `.sidebar-auth-label` - "🌸 Your Pollen" label styling
- `.sidebar-auth-key` - Monospace font for API key display
- `.sidebar-btn-primary` - Green styled login button
- `.sidebar-btn-secondary` - Red styled logout button

## User Flow

### First Time User (No API Key)

1. User visits chat.pollinations.ai
2. Chat works using default publishable key (`plln_pk_EiFtGHYIeDMxNeZBqKaRFBEJQRardmel`)
3. Sidebar shows "Connect with Pollinations" button
4. User clicks button → redirected to `enter.pollinations.ai/authorize`

### Login Flow

1. User signs in at enter.pollinations.ai
2. Gets temporary API key (30-day expiration)
3. Redirected back to chat with key in URL fragment: `chat.pollinations.ai#api_key=sk_abc123xyz`
4. `useAuth` hook extracts key from URL, stores in localStorage
5. URL fragment is cleaned (removed from browser bar)
6. API token is updated via `setApiToken()`
7. Sidebar now shows "🌸 Your Pollen" with key preview

### Authenticated User

- All API calls use user's personal API key
- User pays for their own usage (their pollen)
- Sidebar displays first 14 characters of their key
- Can click "Disconnect" to logout

### Logout Flow

1. User clicks "Disconnect"
2. API key removed from localStorage
3. App reverts to default publishable key
4. Sidebar shows "Connect with Pollinations" again

## Security Features

- **Fragment-based redirect**: API key in `#api_key=...` never hits server logs
- **Automatic cleanup**: URL fragment removed after extraction
- **Local storage only**: Key stored client-side, never transmitted to chat server
- **Temporary keys**: Keys expire in 30 days, can be revoked from dashboard

## Benefits of BYOP

1. **$0 costs for app developer** - Users pay for their own API usage
2. **No backend needed** - Pure frontend implementation
3. **Self-regulating** - Everyone manages their own pollen balance
4. **No key drama** - Auth flow handles everything
5. **Scales freely** - 1 user or 1000 users, same cost: free

## Testing the Implementation

To test locally:

```bash
cd apps/chat
npm install
npm run dev
```

Then:
1. Open http://localhost:5173
2. Click sidebar toggle (left side)
3. Look for "Connect with Pollinations" button at bottom of sidebar
4. Click to start BYOP flow
5. After redirect, verify key is stored and displayed

## Deployment

The chat app is deployed via GitHub Pages. After merging this PR:
1. Push to main branch
2. GitHub Actions will build and deploy automatically
3. Access at production URL (check DEPLOYMENT.md)

## Future Enhancements

Potential improvements:
- Show pollen balance in sidebar
- Add "Get More Pollen" link
- Display token expiration date
- Add warning when approaching balance limits
