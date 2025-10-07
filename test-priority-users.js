#!/usr/bin/env node

/**
 * Test script to verify priority user functionality for nanobanana and seedream models
 * Tests with token mttnGApCZjFxVZNg (user: thomashmyceli)
 */

// Enable debug logging BEFORE importing modules
process.env.DEBUG = 'pollinations:*';

// Set PRIORITY_MODEL_USERS environment variable for testing
process.env.PRIORITY_MODEL_USERS = "d-Dice,Itachi-1824,Circuit-Overtime,thomashmyceli,helpurselfreturn,SenhorEgonss";

import { enqueue } from './shared/ipQueue.js';
import { shouldBypassQueue } from './shared/auth-utils.js';

// Mock request object with priority user token
const createMockRequest = (token) => ({
    url: 'http://localhost:16006/prompt/test?model=nanobanana',
    method: 'GET',
    headers: {
        get: (name) => {
            if (name === 'cf-connecting-ip') return '127.0.0.1';
            if (name === 'authorization') return `Bearer ${token}`;
            return null;
        },
        authorization: `Bearer ${token}`
    },
    ip: '127.0.0.1'
});

// Test function
async function testPriorityUser() {
    console.log('🧪 Testing Priority User Functionality\n');
    console.log('=' .repeat(60));
    
    const token = 'mttnGApCZjFxVZNg';
    console.log(`\n📋 Test Token: ${token}`);
    
    // First, verify authentication
    console.log('\n🔐 Step 1: Verifying authentication...');
    const testReq = createMockRequest(token);
    const authResult = await shouldBypassQueue(testReq);
    
    console.log(`   ✓ Authenticated: ${authResult.authenticated}`);
    console.log(`   ✓ User ID: ${authResult.userId}`);
    console.log(`   ✓ Username: ${authResult.username || 'N/A'}`);
    console.log(`   ✓ Tier: ${authResult.tier}`);
    console.log(`   ✓ Token Auth: ${authResult.tokenAuth}`);
    
    // Check if user is in priority list
    const priorityUsers = process.env.PRIORITY_MODEL_USERS?.split(',') || [];
    const isPriorityUser = authResult.username && priorityUsers.includes(authResult.username);
    console.log(`   ✓ Is Priority User: ${isPriorityUser ? '✅ YES' : '❌ NO'}`);
    console.log(`   ✓ Priority Users List: ${priorityUsers.join(', ')}`);
    
    console.log(`\n🎯 Expected Behavior: ${isPriorityUser ? 'Higher concurrency cap' : 'Standard tier-based cap'}\n`);
    
    // Test with nanobanana model
    console.log('🍌 Step 2: Testing with nanobanana model...');
    const nanobananaReq = createMockRequest(token);
    
    try {
        const result = await enqueue(
            nanobananaReq,
            async () => {
                return { success: true, message: 'Request processed' };
            },
            {
                interval: 30000,
                cap: 1,
                forceCap: false,
                model: 'nanobanana'
            }
        );
        
        console.log('   ✅ Nanobanana test passed:', result);
    } catch (error) {
        console.error('   ❌ Nanobanana test failed:', error.message);
    }
    
    // Test with seedream model
    console.log('\n🌱 Step 3: Testing with seedream model...');
    const seedreamReq = createMockRequest(token);
    
    try {
        const result = await enqueue(
            seedreamReq,
            async () => {
                return { success: true, message: 'Request processed' };
            },
            {
                interval: 45000,
                cap: 1,
                forceCap: false,
                model: 'seedream'
            }
        );
        
        console.log('   ✅ Seedream test passed:', result);
    } catch (error) {
        console.error('   ❌ Seedream test failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n💡 Look for these debug log messages above:');
    console.log('   - "Using nanobanana priority user cap: X for user: thomashmyceli"');
    console.log('   - "Using seedream priority user cap: X for user: thomashmyceli"');
    console.log('\n   If you see these messages, priority user system is working! 🎉\n');
}

// Run test
testPriorityUser().catch(console.error);
