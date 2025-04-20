#!/usr/bin/env node

/**
 * Pollinations Authentication Server
 * 
 * A simple Express server that handles GitHub OAuth authentication and provides
 * endpoints for users to manage their authentication settings.
 * 
 * This server is designed to be deployed at me.pollinations.ai and provides:
 * 1. GitHub OAuth authentication flow
 * 2. Token-based authentication management
 * 3. Referrer-based authentication management
 * 4. Simple web interface for managing authentication
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  completeAuth, 
  isAuthenticated, 
  getToken, 
  regenerateToken, 
  listReferrers, 
  addReferrer, 
  removeReferrer, 
  verifyToken, 
  verifyReferrer 
} from './src/services/authService.js';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

// Check for required environment variables
if (!GITHUB_CLIENT_ID) {
  console.error('Error: GITHUB_CLIENT_ID environment variable is not set');
  console.error('Please set the following environment variables:');
  console.error('  - GITHUB_CLIENT_ID: Your GitHub OAuth App Client ID');
  console.error('  - GITHUB_CLIENT_SECRET: Your GitHub OAuth App Client Secret');
  process.exit(1);
}

// Create Express app
const app = express();

// Configure middleware
app.use(cors({
  origin: ['https://text.pollinations.ai', 'https://image.pollinations.ai'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Simple API authentication middleware
const authenticateApi = async (req, res, next) => {
  // Check for session authentication
  if (req.session.authenticated && req.session.userId) {
    return next();
  }
  
  // Check for token authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const result = await verifyToken(token);
    
    if (result.valid) {
      req.session.authenticated = true;
      req.session.userId = result.userId;
      return next();
    }
  }
  
  // Check for referrer authentication
  const referrer = req.headers.referer || req.headers.origin;
  if (referrer && req.session.userId) {
    const result = await verifyReferrer(req.session.userId, new URL(referrer).hostname);
    
    if (result.valid) {
      req.session.authenticated = true;
      return next();
    }
  }
  
  // Not authenticated
  res.status(401).json({ error: 'Unauthorized' });
};

// Routes
// GitHub OAuth login
app.get('/github/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const returnUrl = req.query.returnUrl || '/dashboard';
  
  // Store state and returnUrl in session
  req.session.oauthState = state;
  req.session.returnUrl = returnUrl;
  
  // Redirect to GitHub OAuth
  const redirectUri = encodeURIComponent('https://me.pollinations.ai/github/callback');
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;
  
  res.redirect(authUrl);
});

// GitHub OAuth callback
app.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state to prevent CSRF
  if (!req.session.oauthState || state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter');
  }
  
  try {
    // Complete GitHub OAuth flow
    const authResult = await completeAuth(code, state);
    
    // Set session data
    req.session.authenticated = true;
    req.session.userId = authResult.sessionId;
    req.session.pollinationsToken = authResult.pollinationsToken;
    
    // Clear OAuth state
    delete req.session.oauthState;
    
    // Redirect to return URL or dashboard
    const returnUrl = req.session.returnUrl || '/dashboard';
    delete req.session.returnUrl;
    
    res.redirect(returnUrl);
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).send(`Authentication error: ${error.message}`);
  }
});

// Authentication status endpoint
app.get('/api/auth/status', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }
    
    const status = await isAuthenticated(req.session.userId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoints (require authentication)
// Get current token
app.get('/api/auth/token', authenticateApi, async (req, res) => {
  try {
    const result = await getToken(req.session.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Regenerate token
app.post('/api/auth/token/regenerate', authenticateApi, async (req, res) => {
  try {
    const result = await regenerateToken(req.session.userId);
    req.session.pollinationsToken = result.token;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List referrers
app.get('/api/auth/referrers', authenticateApi, async (req, res) => {
  try {
    const result = await listReferrers(req.session.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add referrer
app.post('/api/auth/referrers', authenticateApi, async (req, res) => {
  try {
    const { referrer } = req.body;
    if (!referrer) {
      return res.status(400).json({ error: 'Referrer is required' });
    }
    
    const result = await addReferrer(req.session.userId, referrer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove referrer
app.delete('/api/auth/referrers/:referrer', authenticateApi, async (req, res) => {
  try {
    const { referrer } = req.params;
    const result = await removeReferrer(req.session.userId, referrer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Serve basic HTML for dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/github/login?returnUrl=/dashboard');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pollinations Authentication</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
        }
        .section {
          margin-bottom: 30px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 5px;
        }
        .token-display {
          font-family: monospace;
          padding: 10px;
          background: #eee;
          border-radius: 3px;
          word-break: break-all;
        }
        button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        button:hover {
          background: #45a049;
        }
        button.danger {
          background: #f44336;
        }
        button.danger:hover {
          background: #d32f2f;
        }
        ul {
          list-style-type: none;
          padding: 0;
        }
        li {
          padding: 8px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eee;
        }
        input[type="text"] {
          padding: 8px;
          width: 70%;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .form-group {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        .info {
          background: #e7f3fe;
          border-left: 6px solid #2196F3;
          padding: 10px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Pollinations Authentication</h1>
        <button id="logout" class="danger">Logout</button>
      </div>
      
      <div class="section">
        <h2>Authentication Status</h2>
        <div id="status"></div>
      </div>

      <div class="section">
        <h2>Personal Access Token</h2>
        <p>Use this token to authenticate API requests to Pollinations services.</p>
        <div id="token-container">
          <div class="token-display" id="token"></div>
          <div style="margin-top: 10px">
            <button id="regenerate-token">Regenerate Token</button>
            <button id="copy-token">Copy Token</button>
          </div>
        </div>
        <div class="info">
          <strong>Note:</strong> Keep this token secure. Anyone with this token can access Pollinations services as you.
        </div>
      </div>

      <div class="section">
        <h2>Authorized Referrers</h2>
        <p>These domains are authorized to use your GitHub identity.</p>
        <ul id="referrers-list"></ul>
        <div class="form-group">
          <input type="text" id="new-referrer" placeholder="example.com">
          <button id="add-referrer">Add Referrer</button>
        </div>
      </div>
      
      <script>
        // Fetch authentication status
        async function fetchStatus() {
          const response = await fetch('/api/auth/status');
          const data = await response.json();
          
          const statusEl = document.getElementById('status');
          statusEl.innerHTML = data.authenticated ? 
            \`<p>Authenticated as <strong>\${data.githubId}</strong></p>\` :
            '<p>Not authenticated</p>';
        }
        
        // Fetch current token
        async function fetchToken() {
          const response = await fetch('/api/auth/token');
          const data = await response.json();
          
          document.getElementById('token').textContent = data.token;
        }
        
        // Regenerate token
        document.getElementById('regenerate-token').addEventListener('click', async () => {
          if (!confirm('Are you sure you want to regenerate your token? This will invalidate the existing token.')) {
            return;
          }
          
          const response = await fetch('/api/auth/token/regenerate', { method: 'POST' });
          const data = await response.json();
          
          document.getElementById('token').textContent = data.token;
        });
        
        // Copy token to clipboard
        document.getElementById('copy-token').addEventListener('click', () => {
          const token = document.getElementById('token').textContent;
          navigator.clipboard.writeText(token)
            .then(() => alert('Token copied to clipboard!'))
            .catch(err => console.error('Failed to copy token:', err));
        });
        
        // Fetch referrers
        async function fetchReferrers() {
          const response = await fetch('/api/auth/referrers');
          const data = await response.json();
          
          const referrersList = document.getElementById('referrers-list');
          referrersList.innerHTML = '';
          
          data.referrers.forEach(referrer => {
            const li = document.createElement('li');
            li.innerHTML = \`
              <span>\${referrer}</span>
              <button class="remove-referrer danger" data-referrer="\${referrer}">Remove</button>
            \`;
            referrersList.appendChild(li);
          });
          
          // Add event listeners to remove buttons
          document.querySelectorAll('.remove-referrer').forEach(button => {
            button.addEventListener('click', removeReferrer);
          });
        }
        
        // Add referrer
        document.getElementById('add-referrer').addEventListener('click', async () => {
          const referrer = document.getElementById('new-referrer').value.trim();
          
          if (!referrer) {
            return alert('Please enter a referrer');
          }
          
          const response = await fetch('/api/auth/referrers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrer })
          });
          
          if (response.ok) {
            document.getElementById('new-referrer').value = '';
            fetchReferrers();
          } else {
            const data = await response.json();
            alert(\`Error: \${data.error}\`);
          }
        });
        
        // Remove referrer
        async function removeReferrer() {
          const referrer = this.dataset.referrer;
          
          if (!confirm(\`Are you sure you want to remove \${referrer}?\`)) {
            return;
          }
          
          const response = await fetch(\`/api/auth/referrers/\${encodeURIComponent(referrer)}\`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            fetchReferrers();
          } else {
            const data = await response.json();
            alert(\`Error: \${data.error}\`);
          }
        }
        
        // Logout
        document.getElementById('logout').addEventListener('click', async () => {
          if (!confirm('Are you sure you want to logout?')) {
            return;
          }
          
          const response = await fetch('/api/auth/logout', { method: 'POST' });
          if (response.ok) {
            window.location.href = '/';
          }
        });
        
        // Initial data load
        fetchStatus();
        fetchToken();
        fetchReferrers();
      </script>
    </body>
    </html>
  `);
});

// Simple home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pollinations Authentication</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          text-align: center;
        }
        .logo {
          max-width: 200px;
          margin-bottom: 20px;
        }
        .button {
          display: inline-block;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-size: 16px;
          margin-top: 20px;
        }
        .button:hover {
          background: #45a049;
        }
        .container {
          margin-top: 50px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Pollinations Authentication</h1>
        <p>
          This service provides authentication for Pollinations services using GitHub as an identity provider.
        </p>
        ${req.session.authenticated ? 
          `<a href="/dashboard" class="button">Go to Dashboard</a>` : 
          `<a href="/github/login" class="button">Login with GitHub</a>`
        }
      </div>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`Pollinations Authentication server running on port ${PORT}`);
  console.log(`To use this service, please set up DNS for me.pollinations.ai`);
});
