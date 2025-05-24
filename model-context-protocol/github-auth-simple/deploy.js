#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to .dev.vars file
const devVarsPath = path.join(__dirname, '.dev.vars.prod');

// Check if .dev.vars exists
if (!fs.existsSync(devVarsPath)) {
  console.error('Error: .dev.vars file not found!');
  process.exit(1);
}

// Read and parse .dev.vars file
const devVarsContent = fs.readFileSync(devVarsPath, 'utf-8');
const envVars = {};

// Parse each line in the .dev.vars file
devVarsContent.split('\n').forEach(line => {
  // Skip empty lines and comments
  if (!line || line.startsWith('#')) return;
  
  // Parse key=value pairs
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const [, key, value] = match;
    envVars[key.trim()] = value.trim();
  }
});

// Check required environment variables
const requiredVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'JWT_SECRET'];
const missingVars = requiredVars.filter(varName => !envVars[varName]);

if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Build the deploy command with full path to npx
const npxPath = '/Users/thomash/.nvm/versions/node/v20.19.0/bin/npx';
let deployCommand = `${npxPath} wrangler deploy --env production`;

// Add environment variables to the command
Object.entries(envVars).forEach(([key, value]) => {
  // Only include the required variables
  if (requiredVars.includes(key)) {
    // Escape special characters in the value
    const escapedValue = value.replace(/"/g, '\\"');
    deployCommand += ` --var "${key}:${escapedValue}"`;
  }
});

console.log('Deploying with environment variables from .dev.vars...');

try {
  // Execute the deploy command
  // Use shell: true to allow the shell to handle the command
  execSync(deployCommand, { stdio: 'inherit', shell: true });
  console.log('Deployment completed successfully!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}
