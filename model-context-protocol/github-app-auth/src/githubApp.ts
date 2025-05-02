/**
 * GitHub App authentication utilities
 * 
 * Follows the "thin proxy" design principle by minimizing data transformation
 * and directly passing through responses where possible.
 */

import * as jose from 'jose';
import type { Env } from './types';

/**
 * Creates a JWT for GitHub App authentication
 * 
 * @param appId GitHub App ID
 * @param privateKey GitHub App private key in PEM format
 * @returns JWT token string
 */
export async function createJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,  // Issued 60 seconds ago
    exp: now + 600, // Expires in 10 minutes
    iss: appId      // GitHub App ID
  };
  
  const alg = 'RS256';
  const key = await jose.importPKCS8(privateKey, alg);
  
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg })
    .sign(key);
}

/**
 * Gets an installation access token for a GitHub App installation
 * 
 * @param jwt JWT token for GitHub App
 * @param installationId Installation ID
 * @returns Installation access token and expiry
 */
export async function getInstallationToken(jwt: string, installationId: string) {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pollinations-GitHub-App'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installation token: ${error}`);
  }
  
  const data = await response.json();
  return {
    token: data.token,
    expiresAt: data.expires_at
  };
}

/**
 * Gets all installations for a GitHub App
 * 
 * @param jwt JWT token for GitHub App
 * @returns List of installations
 */
export async function getAppInstallations(jwt: string) {
  const response = await fetch('https://api.github.com/app/installations', {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pollinations-GitHub-App'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get app installations: ${error}`);
  }
  
  return response.json();
}

/**
 * Checks if a token is expired or about to expire
 * 
 * @param expiresAt ISO date string when token expires
 * @param bufferSeconds Buffer time in seconds before expiry to consider token expired
 * @returns True if token is expired or about to expire
 */
export function isTokenExpired(expiresAt: string, bufferSeconds: number = 300): boolean {
  if (!expiresAt) return true;
  
  const expiryTime = new Date(expiresAt).getTime();
  const currentTime = Date.now();
  const bufferTime = bufferSeconds * 1000;
  
  return currentTime + bufferTime >= expiryTime;
}
