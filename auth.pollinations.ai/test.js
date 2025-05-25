#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

async function test() {
  console.log('🧪 Testing GitHub Auth Simple\n');
  
  // Test 1: Health check
  console.log('1️⃣ Health check...');
  const health = await fetch(BASE_URL);
  console.log(`   Status: ${health.status}`);
  console.log(`   Response: ${await health.text()}\n`);
  
  // Test 2: Authorization flow
  console.log('2️⃣ Authorization flow...');
  const authUrl = `${BASE_URL}/authorize?redirect_uri=${encodeURIComponent('http://localhost:3000/auth/callback')}`;
  console.log(`   Auth URL: ${authUrl}`);
  console.log('   ➡️  Open this URL in browser to test OAuth flow\n');
  
  // Test 3: API endpoints (will fail without token)
  console.log('3️⃣ API endpoints (expecting 401)...');
  const userResp = await fetch(`${BASE_URL}/api/user`);
  console.log(`   GET /api/user: ${userResp.status} ${userResp.statusText}\n`);
  
  console.log('✅ Basic tests complete!');
  console.log('\nTo test the full flow:');
  console.log('1. Open the auth URL above in your browser');
  console.log('2. Complete GitHub OAuth');
  console.log('3. You\'ll be redirected with a JWT token');
  console.log('4. Use that token to test authenticated endpoints');
}

test().catch(console.error);
