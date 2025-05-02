#!/usr/bin/env node

/**
 * Test script for GitHub authentication flow with domain management
 * 
 * This script simulates a bot that helps users manage their allowlisted domains
 * through GitHub authentication following the "thin proxy" design principle.
 */

import fetch from 'node-fetch';
import { createInterface } from 'readline';
import open from 'open';

// Create readline interface for CLI interaction
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8787';
let sessionId = null;
let githubUserId = null;

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

// Helper function to wait for a specific amount of time
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the authentication flow
async function startAuth() {
  console.log('Starting GitHub authentication flow...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/start`);
    const data = await response.json();
    
    sessionId = data.sessionId;
    const authUrl = data.authUrl;
    
    console.log('\n🔐 Please authenticate with GitHub by visiting this URL:');
    console.log(`\n${authUrl}\n`);
    
    const openBrowser = await askQuestion('Would you like to open this URL in your browser? (y/n): ');
    
    if (openBrowser.toLowerCase() === 'y') {
      await open(authUrl);
      console.log('Browser opened. Please complete the authentication in your browser.');
    }
    
    console.log('\nWaiting for authentication to complete...');
    await checkAuthStatus();
    
  } catch (error) {
    console.error('Error starting authentication:', error);
    process.exit(1);
  }
}

// Check authentication status
async function checkAuthStatus() {
  console.log('Checking authentication status...');
  console.log(`Session ID: ${sessionId}`);
  
  let isComplete = false;
  let attempts = 0;
  const maxAttempts = 30; // Check for up to 5 minutes (30 * 10 seconds)
  
  while (!isComplete && attempts < maxAttempts) {
    try {
      const response = await fetch(`${API_BASE_URL}/status/${sessionId}`);
      const data = await response.json();
      
      if (data.status === 'complete' && data.userId) {
        isComplete = true;
        githubUserId = data.userId;
        console.log('\n✅ Authentication successful!');
        console.log(`GitHub User ID: ${githubUserId}`);
        return;
      }
      
      console.log('Authentication pending... (waiting 2 seconds)');
      await wait(2000); // Wait 2 seconds before checking again
      attempts++;
      
    } catch (error) {
      console.error('Error checking auth status:', error);
      await wait(2000);
      attempts++;
    }
  }
  
  if (!isComplete) {
    console.error('\n❌ Authentication timed out. Please try again.');
    process.exit(1);
  }
}

// Get user's allowlisted domains
async function getDomains() {
  if (!githubUserId) {
    console.error('Not authenticated. Please authenticate first.');
    return [];
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/${githubUserId}/domains`, {
      headers: {
        'x-session-id': sessionId
      }
    });
    const data = await response.json();
    
    return data.domains || [];
  } catch (error) {
    console.error('Error getting domains:', error);
    return [];
  }
}

// Update user's allowlisted domains
async function updateDomains(domains) {
  if (!githubUserId) {
    console.error('Not authenticated. Please authenticate first.');
    return false;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/${githubUserId}/domains`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ domains })
    });
    
    const data = await response.json();
    return data.success || false;
  } catch (error) {
    console.error('Error updating domains:', error);
    return false;
  }
}

// Main menu
async function showMainMenu() {
  console.log('\n📋 MAIN MENU');
  console.log('1. View allowlisted domains');
  console.log('2. Add a domain');
  console.log('3. Remove a domain');
  console.log('4. Exit');
  
  const choice = await askQuestion('\nEnter your choice (1-4): ');
  
  switch (choice) {
    case '1':
      await viewDomains();
      break;
    case '2':
      await addDomain();
      break;
    case '3':
      await removeDomain();
      break;
    case '4':
      console.log('\nThank you for using the GitHub Auth Bot. Goodbye!');
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('\nInvalid choice. Please try again.');
      await showMainMenu();
  }
}

// View domains
async function viewDomains() {
  const domains = await getDomains();
  
  console.log('\n🌐 Your allowlisted domains:');
  
  if (domains.length === 0) {
    console.log('No domains are currently allowlisted.');
  } else {
    domains.forEach((domain, index) => {
      console.log(`${index + 1}. ${domain}`);
    });
  }
  
  await showMainMenu();
}

// Add a domain
async function addDomain() {
  const domains = await getDomains();
  const newDomain = await askQuestion('\nEnter the domain to add (e.g., example.com): ');
  
  if (!newDomain) {
    console.log('No domain entered. Operation cancelled.');
    await showMainMenu();
    return;
  }
  
  // Simple domain validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(newDomain)) {
    console.log('Invalid domain format. Please enter a valid domain.');
    await addDomain();
    return;
  }
  
  if (domains.includes(newDomain)) {
    console.log(`Domain ${newDomain} is already allowlisted.`);
  } else {
    const updatedDomains = [...domains, newDomain];
    const success = await updateDomains(updatedDomains);
    
    if (success) {
      console.log(`✅ Domain ${newDomain} added successfully!`);
    } else {
      console.log(`❌ Failed to add domain ${newDomain}.`);
    }
  }
  
  await showMainMenu();
}

// Remove a domain
async function removeDomain() {
  const domains = await getDomains();
  
  if (domains.length === 0) {
    console.log('\nNo domains are currently allowlisted.');
    await showMainMenu();
    return;
  }
  
  console.log('\n🌐 Your allowlisted domains:');
  domains.forEach((domain, index) => {
    console.log(`${index + 1}. ${domain}`);
  });
  
  const choice = await askQuestion('\nEnter the number of the domain to remove (or 0 to cancel): ');
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= domains.length) {
    if (choice !== '0') {
      console.log('Invalid selection. Please try again.');
    } else {
      console.log('Operation cancelled.');
    }
  } else {
    const domainToRemove = domains[index];
    const updatedDomains = domains.filter((_, i) => i !== index);
    const success = await updateDomains(updatedDomains);
    
    if (success) {
      console.log(`✅ Domain ${domainToRemove} removed successfully!`);
    } else {
      console.log(`❌ Failed to remove domain ${domainToRemove}.`);
    }
  }
  
  await showMainMenu();
}

// Main function
async function main() {
  console.log('\n🤖 GitHub Auth Bot - Domain Management');
  console.log('====================================\n');
  
  console.log('This bot helps you manage your allowlisted domains after authenticating with GitHub.');
  console.log('You will be guided through the authentication process and then can manage your domains.\n');
  
  const startNow = await askQuestion('Would you like to start the authentication process? (y/n): ');
  
  if (startNow.toLowerCase() !== 'y') {
    console.log('\nThank you for using the GitHub Auth Bot. Goodbye!');
    rl.close();
    process.exit(0);
  }
  
  await startAuth();
  await showMainMenu();
}

// Start the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
