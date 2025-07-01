#!/usr/bin/env node

// Test environment variables
console.log('Environment Variables:');
console.log('CLOUDFLARE_ACCOUNT_ID:', process.env.CLOUDFLARE_ACCOUNT_ID);
console.log('CLOUDFLARE_AUTH_TOKEN:', process.env.CLOUDFLARE_AUTH_TOKEN ? 'SET' : 'NOT SET');
console.log('VECTORIZE_CACHE:', process.env.VECTORIZE_CACHE);
