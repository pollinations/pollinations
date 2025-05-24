/**
 * Test script to verify JWT implementation
 */

import { generateJWTSecret } from './src/auth/jwt';

async function testJWT() {
  console.log('Testing JWT Secret Generation...');
  
  try {
    // Generate a JWT secret
    const secret = await generateJWTSecret();
    console.log('✓ Generated JWT Secret:', secret.substring(0, 10) + '...');
    console.log('  Length:', secret.length);
    
    // Test that it's a valid base64 string
    const decoded = atob(secret);
    console.log('✓ Valid base64 encoding');
    console.log('  Decoded length:', decoded.length, 'bytes');
    
    console.log('\nJWT implementation test passed!');
    console.log('\nTo use in production:');
    console.log('1. Add this to your .dev.vars file:');
    console.log(`   JWT_SECRET=${secret}`);
    console.log('2. Or generate a new one with:');
    console.log('   openssl rand -base64 32');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testJWT();
