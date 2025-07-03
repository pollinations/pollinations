import type { Env, GitHubUser } from './types';

export async function exchangeCodeForToken(code: string, redirectUri: string, env: Env): Promise<string> {
  // Use environment variables from env object
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  
  console.log('GitHub OAuth exchange using environment variables');
  
  // Log for debugging with more details
  console.log('Using credentials:', {
    clientId, // Temporarily log the full client ID for debugging
    clientSecret, // Temporarily log the full client secret for debugging
    redirectUri,
    env_keys: Object.keys(env)
  });
  
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  
  if (data.error || !data.access_token) {
    const errorMessage = data.error_description || data.error || 'Failed to get access token';
    console.error('GitHub OAuth error:', data);
    throw new Error(errorMessage);
  }
  
  return data.access_token;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  console.log('Getting GitHub user with token:', accessToken.substring(0, 5) + '...');
  
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'auth.pollinations.ai', // Adding User-Agent as GitHub requires it
      },
    });
    
    // Get response body for error reporting
    const text = await response.text();
    
    // Check if response is successful
    if (!response.ok) {
      console.error('GitHub API error:', {
        status: response.status,
        statusText: response.statusText,
        body: text,
        headers: Object.fromEntries([...response.headers.entries()])
      });
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${text}`);
    }
    
    // Parse JSON (safe since we already read the text)
    const data = JSON.parse(text) as GitHubUser;
    console.log('GitHub user data received:', { login: data.login, id: data.id });
    return data;
  } catch (error) {
    console.error('Error in getGitHubUser:', error);
    throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : String(error)}`);
  }
}
