/**
 * GitHub authentication utilities
 * 
 * Follows the "thin proxy" design principle by minimizing data transformation
 * and directly passing through responses where possible.
 */

import { GitHub } from 'arctic';
import type { Env, TokenData } from './types';

// Define GitHub user profile interface
export interface GitHubUserProfile {
  id: number;
  login: string;
  avatar_url?: string;
  name?: string;
  email?: string;
  [key: string]: any; // Allow for additional fields from GitHub API
}

/**
 * Creates a GitHub OAuth client using Arctic
 */
export function createGitHubOAuthClient(env: Env) {
  const github = new GitHub(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.REDIRECT_URI
  );
  
  return github;
}

/**
 * Gets the GitHub user profile
 */
export async function getUserProfile(accessToken: string): Promise<GitHubUserProfile> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pollinations-GitHub-App'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user profile: ${error}`);
  }
  
  return response.json();
}

/**
 * Gets installations for the authenticated user
 */
export async function getUserInstallations(accessToken: string) {
  const response = await fetch('https://api.github.com/user/installations', {
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pollinations-GitHub-App'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user installations: ${error}`);
  }
  
  return response.json();
}
