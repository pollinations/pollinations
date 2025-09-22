#!/usr/bin/env node

/**
 * Test script for blocked users functionality
 */

import dotenv from 'dotenv';
dotenv.config();

// Test the blocked users parsing
const blockedUsers = process.env.BLOCKED_USERS_GEMINI?.split(',').map(u => u.trim()) || [];

console.log('🔍 Testing Blocked Users Configuration');
console.log('Environment variable BLOCKED_USERS_GEMINI:', process.env.BLOCKED_USERS_GEMINI);
console.log('Parsed blocked users array:', blockedUsers);
console.log('Number of blocked users:', blockedUsers.length);

// Test some usernames
const testUsernames = [
    'SteamPoweredCat',
    'SteamSteamPoweredCat', 
    'bestPlayerWitchhouse',
    'normalUser',
    'anonymous'
];

console.log('\n🧪 Testing username blocking:');
testUsernames.forEach(username => {
    const isBlocked = blockedUsers.includes(username);
    console.log(`  ${username}: ${isBlocked ? '🚫 BLOCKED' : '✅ ALLOWED'}`);
});

// Test the error message
const testBlockedUser = blockedUsers[0];
if (testBlockedUser) {
    const errorMessage = `Sorry, you are blocked from using the nano-banana model due to content violations`;
    console.log(`\n📝 Error message for ${testBlockedUser}:`);
    console.log(`"${errorMessage}"`);
}
