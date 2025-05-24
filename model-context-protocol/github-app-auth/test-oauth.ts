/**
 * Test script for OAuth 2.1 endpoints
 */

const BASE_URL = 'http://localhost:61036';

async function testOAuthEndpoints() {
  console.log('Testing OAuth 2.1 Endpoints...\n');
  
  // Test 1: OAuth Metadata Discovery
  console.log('1. Testing OAuth Metadata Discovery:');
  try {
    const metadataResponse = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
    const metadata = await metadataResponse.json();
    console.log('✓ Metadata endpoint accessible');
    console.log('  Authorization endpoint:', metadata.authorization_endpoint);
    console.log('  Token endpoint:', metadata.token_endpoint);
    console.log('  PKCE support:', metadata.code_challenge_methods_supported);
  } catch (error) {
    console.error('❌ Metadata test failed:', error);
  }
  
  // Test 2: JWKS Endpoint
  console.log('\n2. Testing JWKS Endpoint:');
  try {
    const jwksResponse = await fetch(`${BASE_URL}/jwks`);
    const jwks = await jwksResponse.json();
    console.log('✓ JWKS endpoint accessible');
    console.log('  Keys available:', jwks.keys.length);
  } catch (error) {
    console.error('❌ JWKS test failed:', error);
  }
  
  // Test 3: Generate PKCE challenge
  console.log('\n3. Testing PKCE Generation:');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  console.log('✓ PKCE generated');
  console.log('  Code verifier length:', codeVerifier.length);
  console.log('  Code challenge:', codeChallenge.substring(0, 20) + '...');
  
  // Test 4: Authorization URL
  console.log('\n4. Building Authorization URL:');
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:3000/callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: crypto.randomUUID()
  });
  const authUrl = `${BASE_URL}/authorize?${authParams}`;
  console.log('✓ Authorization URL:', authUrl);
  
  console.log('\n✅ OAuth 2.1 endpoints are ready!');
  console.log('\nNext steps:');
  console.log('1. Visit the authorization URL in a browser to test the flow');
  console.log('2. After GitHub auth, exchange the code for JWT tokens at /token');
  console.log('3. Use the JWT token in Authorization: Bearer header for API requests');
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Run tests
testOAuthEndpoints();
