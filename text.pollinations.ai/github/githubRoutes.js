import express from 'express';
import debug from 'debug';
import {
  createSession,
  getSession,
  updateSession,
  getGithubAuthUrl,
  exchangeCodeForToken,
  getGithubUserInfo,
  authenticateUser,
  isGithubTokenValid
} from './githubAuth.js';
import {
  getUserById,
  getUserByToken,
  listReferrers,
  addReferrer,
  removeReferrer,
  regeneratePollinationsToken,
  isReferrerWhitelisted
} from './tokenStorage.js';

const log = debug('pollinations:github-routes');
const errorLog = debug('pollinations:github-routes:error');

const router = express.Router();

/**
 * Middleware to handle errors
 */
const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validate that a session exists
 */
const validateSession = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session ID' });
  }
  
  const session = getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  req.session = session;
  req.sessionId = sessionId;
  next();
});

/**
 * Validate that a user is authenticated in a session
 */
const validateAuthentication = asyncHandler(async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Check if GitHub token is still valid
  const userResult = await getUserById(req.session.userId);
  
  if (!userResult.success) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  const isValid = await isGithubTokenValid(userResult.user.github_token);
  
  if (!isValid) {
    return res.status(401).json({ error: 'GitHub token is no longer valid' });
  }
  
  req.user = userResult.user;
  next();
});

/**
 * Start GitHub OAuth flow
 */
router.get('/login', asyncHandler(async (req, res) => {
  // Get return URL from query params
  const { returnUrl } = req.query;
  
  // Get or create session
  let sessionId = req.query.sessionId;
  let session;
  
  if (sessionId) {
    session = getSession(sessionId);
  }
  
  if (!session) {
    const newSession = createSession();
    sessionId = newSession.sessionId;
    session = getSession(sessionId);
  }
  
  // Store return URL in session
  if (returnUrl) {
    updateSession(sessionId, { returnUrl });
  }
  
  // Generate GitHub auth URL
  const authUrl = getGithubAuthUrl(sessionId, session.state);
  
  // Redirect to GitHub OAuth
  res.redirect(authUrl);
}));

/**
 * GitHub OAuth callback
 */
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, sessionId } = req.query;
  
  if (!code || !state || !sessionId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  // Validate session
  const session = getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  // Validate state to prevent CSRF
  if (state !== session.state) {
    return res.status(403).json({ error: 'Invalid state' });
  }
  
  try {
    // Exchange code for token
    const token = await exchangeCodeForToken(code);
    
    // Get GitHub user info
    const githubUser = await getGithubUserInfo(token);
    
    // Authenticate and store token
    const authResult = await authenticateUser(githubUser, token);
    
    // Update session with user info
    updateSession(sessionId, {
      userId: authResult.userId,
      githubLogin: authResult.login
    });
    
    // Redirect to return URL or success page
    const returnUrl = session.returnUrl || '/github/success';
    res.redirect(`${returnUrl}?sessionId=${sessionId}`);
  } catch (error) {
    errorLog('Error during GitHub callback:', error);
    res.status(500).json({ error: error.message });
  }
}));

/**
 * Success page for GitHub OAuth
 */
router.get('/success', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).send('Missing session ID');
  }
  
  res.send(`
    <html>
      <head>
        <title>GitHub Authentication Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
          }
          h1 { color: #2DA44E; }
          .token { background: #f6f8fa; padding: 1rem; border-radius: 6px; overflow-wrap: break-word; }
          .code { font-family: monospace; background: #f6f8fa; padding: 0.2rem 0.4rem; border-radius: 3px; }
          button {
            background: #2DA44E;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 1rem;
            cursor: pointer;
          }
          button:hover { background: #2c974b; }
        </style>
      </head>
      <body>
        <h1>GitHub Authentication Successful!</h1>
        <p>You have successfully authenticated with GitHub. Your session ID is:</p>
        <p class="token">${sessionId}</p>
        <p>Use this session ID for API calls or store it securely for future use.</p>
        <h2>Get Your Pollinations Token</h2>
        <p>You can get your Pollinations token with the following API call:</p>
        <p class="code">GET /github/token?sessionId=${sessionId}</p>
        <button onclick="getToken()">Get Token</button>
        <div id="token-result"></div>
        
        <script>
          async function getToken() {
            try {
              const response = await fetch('/github/token?sessionId=${sessionId}');
              const data = await response.json();
              
              if (data.error) {
                document.getElementById('token-result').innerHTML = \`<p style="color: red">Error: \${data.error}</p>\`;
              } else {
                document.getElementById('token-result').innerHTML = \`
                  <h3>Your Pollinations Token:</h3>
                  <p class="token">\${data.token}</p>
                  <p>Use this token for direct API authentication with Pollinations services.</p>
                \`;
              }
            } catch (error) {
              document.getElementById('token-result').innerHTML = \`<p style="color: red">Error: \${error.message}</p>\`;
            }
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * Check authentication status
 */
router.get('/status', validateSession, asyncHandler(async (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  
  // Check if GitHub token is still valid
  const userResult = await getUserById(req.session.userId);
  
  if (!userResult.success) {
    return res.json({ authenticated: false, error: 'User not found' });
  }
  
  const isValid = await isGithubTokenValid(userResult.user.github_token);
  
  return res.json({
    authenticated: isValid,
    userId: req.session.userId,
    githubLogin: req.session.githubLogin
  });
}));

/**
 * Get Pollinations token
 */
router.get('/token', validateSession, validateAuthentication, asyncHandler(async (req, res) => {
  const userResult = await getUserById(req.session.userId);
  
  if (!userResult.success) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    token: userResult.user.pollinations_token,
    userId: req.session.userId,
    created: userResult.user.created_at
  });
}));

/**
 * Regenerate Pollinations token
 */
router.post('/token/regenerate', validateSession, validateAuthentication, asyncHandler(async (req, res) => {
  const result = await regeneratePollinationsToken(req.session.userId);
  
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  
  res.json({
    token: result.pollinations_token,
    userId: req.session.userId
  });
}));

/**
 * List referrers
 */
router.get('/referrers/list', validateSession, validateAuthentication, asyncHandler(async (req, res) => {
  const result = await listReferrers(req.session.userId);
  
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  
  res.json({ referrers: result.referrers });
}));

/**
 * Add referrer
 */
router.post('/referrers/add', validateSession, validateAuthentication, asyncHandler(async (req, res) => {
  const { referrer } = req.body;
  
  if (!referrer) {
    return res.status(400).json({ error: 'Missing referrer' });
  }
  
  const result = await addReferrer(req.session.userId, referrer);
  
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  
  res.json({ message: result.message });
}));

/**
 * Remove referrer
 */
router.post('/referrers/remove', validateSession, validateAuthentication, asyncHandler(async (req, res) => {
  const { referrer } = req.body;
  
  if (!referrer) {
    return res.status(400).json({ error: 'Missing referrer' });
  }
  
  const result = await removeReferrer(req.session.userId, referrer);
  
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  
  res.json({ message: result.message });
}));

/**
 * Authenticate by token
 */
router.post('/auth/token', asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }
  
  const result = await getUserByToken(token);
  
  if (!result.success) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  res.json({
    authenticated: true,
    userId: result.userId,
    githubToken: result.githubToken
  });
}));

/**
 * Authenticate by referrer
 */
router.post('/auth/referrer', asyncHandler(async (req, res) => {
  const { userId, referrer } = req.body;
  
  if (!userId || !referrer) {
    return res.status(400).json({ error: 'Missing userId or referrer' });
  }
  
  // Check if referrer is whitelisted
  const result = await isReferrerWhitelisted(userId, referrer);
  
  if (!result.allowed) {
    return res.status(403).json({ error: result.error || 'Referrer not allowed' });
  }
  
  // Get GitHub token
  const userResult = await getUserById(userId);
  
  if (!userResult.success) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    authenticated: true,
    userId,
    githubToken: userResult.user.github_token
  });
}));

/**
 * Error handler
 */
router.use((err, req, res, next) => {
  errorLog('GitHub routes error:', err);
  res.status(500).json({ error: err.message });
});

export default router;
