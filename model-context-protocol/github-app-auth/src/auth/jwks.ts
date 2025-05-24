/**
 * JWKS (JSON Web Key Set) endpoint for JWT validation
 */

import type { Env } from '../types';

/**
 * Generate a JWKS response for public key discovery
 * Note: This is a simplified version using symmetric keys (HS256)
 * In production, you should use asymmetric keys (RS256) for better security
 */
export async function handleJWKS(request: Request, env: Env): Promise<Response> {
  // In production, you would expose public keys here
  // For symmetric keys (HS256), we don't expose the secret
  const jwks = {
    keys: [
      {
        kty: 'oct', // Key type for symmetric keys
        use: 'sig', // Key usage
        kid: 'default', // Key ID
        alg: 'HS256', // Algorithm
        // Note: We don't include the actual key value for security
      }
    ]
  };
  
  return new Response(JSON.stringify(jwks), {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=3600'
    }
  });
}
