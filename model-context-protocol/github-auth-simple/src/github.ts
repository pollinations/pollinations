import type { Env, GitHubUser } from './types';

export async function exchangeCodeForToken(code: string, redirectUri: string, env: Env): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  
  const data = await response.json() as { access_token?: string; error?: string };
  
  if (data.error || !data.access_token) {
    throw new Error(data.error || 'Failed to get access token');
  }
  
  return data.access_token;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get user info');
  }
  
  return response.json() as Promise<GitHubUser>;
}
