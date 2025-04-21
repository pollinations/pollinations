// GitHub OAuth handlers for the Pollinations MCP server
import crypto from 'crypto';

/**
 * Creates GitHub OAuth handlers for Express
 * @param {Object} options - Configuration options
 * @param {string} options.clientId - GitHub OAuth client ID
 * @param {string} options.clientSecret - GitHub OAuth client secret
 * @param {string} options.redirectUri - OAuth redirect URI
 * @param {Function} options.verifyToken - Function to verify tokens
 * @returns {Object} GitHub OAuth handlers
 */
export function createGithubAuthHandlers({ clientId, clientSecret, redirectUri, verifyToken }) {
  /**
   * GitHub OAuth login handler
   */
  const handleGithubLogin = async (req, res) => {
    const { returnUrl } = req.query;
    
    // Generate a random state to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state and return URL in cookies
    res.cookie('oauth_state', state, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV !== 'development',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
    
    if (returnUrl) {
      res.cookie('return_url', returnUrl, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 10 * 60 * 1000 // 10 minutes
      });
    }
    
    // Redirect to GitHub OAuth
    const encodedRedirectUri = encodeURIComponent(redirectUri);
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedRedirectUri}&scope=read:user&state=${state}`;
    res.redirect(authUrl);
  };

  /**
   * GitHub OAuth callback handler
   */
  const handleGithubCallback = async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies.oauth_state;
    const returnUrl = req.cookies.return_url || '';
    
    // Verify state to prevent CSRF
    if (!storedState || state !== storedState) {
      return res.status(400).send('Invalid state parameter');
    }
    
    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error('GitHub OAuth error:', tokenData.error);
        return res.status(400).send(`GitHub OAuth error: ${tokenData.error}`);
      }
      
      const accessToken = tokenData.access_token;
      
      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      const userData = await userResponse.json();
      
      if (userResponse.status !== 200) {
        console.error('GitHub API error:', userData);
        return res.status(400).send('Failed to get user data from GitHub');
      }
      
      // Generate a session ID
      const userId = userData.id.toString();
      
      // Set user ID cookie
      res.cookie('userId', userId, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Clear OAuth cookies
      res.clearCookie('oauth_state');
      res.clearCookie('return_url');
      
      // Redirect to return URL or success page
      if (returnUrl) {
        res.redirect(returnUrl);
      } else {
        res.send(`
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                .success { color: green; }
                .info { margin: 20px 0; }
                .button { 
                  display: inline-block; 
                  padding: 10px 20px; 
                  background-color: #4CAF50; 
                  color: white; 
                  text-decoration: none; 
                  border-radius: 4px; 
                }
              </style>
            </head>
            <body>
              <h1 class="success">Authentication Successful!</h1>
              <p class="info">You are now authenticated as ${userData.login}.</p>
              <p>You can close this window and return to your application.</p>
              <a class="button" href="javascript:window.close()">Close Window</a>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('Error in GitHub OAuth callback:', error);
      res.status(500).send('Authentication error');
    }
  };

  return {
    handleGithubLogin,
    handleGithubCallback
  };
}
