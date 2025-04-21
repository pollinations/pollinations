#!/usr/bin/env node

/**
 * Pollinations Authentication Server
 *
 * A minimalist Express server that handles GitHub OAuth authentication for the MCP server.
 * This server only provides the essential OAuth endpoints and does not include a web interface.
 * All authentication management is done through the MCP tools.
 *
 * This server is designed to be deployed at me.pollinations.ai and provides:
 * 1. GitHub OAuth authentication flow
 * 2. API endpoints for token verification
 * 3. API endpoints for referrer validation
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import {
  completeAuth,
  verifyToken,
  verifyReferrer
} from './src/services/authService.js';

// Configuration
const PORT = process.env.PORT || 3000;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Determine if we're in test mode
const TEST_MODE = process.env.TEST_MODE === 'true';

// Set the redirect URI based on the environment
const REDIRECT_URI = process.env.REDIRECT_URI ||
  (TEST_MODE ? `http://localhost:${PORT}/github/callback` : 'https://flow.pollinations.ai/github/callback');

console.log(`Running in ${TEST_MODE ? 'TEST' : 'PRODUCTION'} mode`);
console.log(`Using redirect URI: ${REDIRECT_URI}`);

// Check for required environment variables
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.error('Error: GitHub OAuth credentials are not set');
  console.error('Please set the following environment variables:');
  console.error('  - GITHUB_CLIENT_ID: Your GitHub OAuth App Client ID');
  console.error('  - GITHUB_CLIENT_SECRET: Your GitHub OAuth App Client Secret');
  process.exit(1);
}

// Create Express app
const app = express();

// Configure middleware
app.use(cors({
  origin: TEST_MODE ? '*' : ['https://text.pollinations.ai', 'https://image.pollinations.ai'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
// GitHub OAuth login
app.get('/github/login', async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const returnUrl = req.query.returnUrl || '';

  // Store state in a cookie that will be validated in the callback
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000 // 10 minutes
  });

  if (returnUrl) {
    res.cookie('return_url', returnUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
  }

  // Redirect to GitHub OAuth
  const redirectUri = encodeURIComponent(REDIRECT_URI);
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;

  res.redirect(authUrl);
});

// GitHub OAuth callback
app.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies.oauth_state;
  const returnUrl = req.cookies.return_url || '';

  // Verify state to prevent CSRF
  if (!storedState || state !== storedState) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  try {
    // Complete GitHub OAuth flow
    const authResult = await completeAuth(code, state);

    // Clear cookies
    res.clearCookie('oauth_state');
    res.clearCookie('return_url');

    // Return the auth result as JSON or redirect in production mode
    if (returnUrl) {
      // Format: returnUrl?userId=...&token=...
      const redirectUrl = `${returnUrl}?userId=${encodeURIComponent(authResult.sessionId)}&token=${encodeURIComponent(authResult.pollinationsToken)}`;
      res.redirect(redirectUrl);
    } else {
      res.json({
        success: true,
        message: 'Authentication successful',
        userId: authResult.sessionId,
        token: authResult.pollinationsToken
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Token verification endpoint
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await verifyToken(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Referrer verification endpoint
app.post('/api/auth/verify-referrer', async (req, res) => {
  try {
    const { userId, referrer } = req.body;

    if (!userId || !referrer) {
      return res.status(400).json({ error: 'User ID and referrer are required' });
    }

    const result = await verifyReferrer(userId, referrer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Pollinations Authentication server running on port ${PORT}`);
  console.log(`GitHub OAuth callback URL: ${REDIRECT_URI}`);
  console.log(`GitHub Client ID: ${GITHUB_CLIENT_ID}`);

  if (TEST_MODE) {
    console.log('\nTest Mode Instructions:');
    console.log('1. Open your browser to http://localhost:' + PORT + '/github/login');
    console.log('2. Complete the GitHub authentication');
    console.log('3. Copy the Session ID from the success page');
    console.log('4. Use the Session ID with the MCP authentication tools');
  }
});
