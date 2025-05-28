#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get environment file path from ENV_FILE environment variable or use default
const envFile = process.env.ENV_FILE || '.dev.vars.prod';
const devVarsPath = path.join(__dirname, envFile);

// Check if environment file exists
if (!fs.existsSync(devVarsPath)) {
  console.error(`Error: ${envFile} file not found!`);
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
const requiredVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'JWT_SECRET', 'ADMIN_API_KEY'];
const missingVars = requiredVars.filter(varName => !envVars[varName]);

if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Database ID from wrangler.toml
const databaseId = "4145d600-1df6-44a2-9769-5d5f731deb77";
const databaseName = "github_auth";

console.log('Starting deployment process...');

try {
  // Step 1: Check if user_tiers table exists
  console.log('\n🔍 Checking if user_tiers table exists...');
  
  // First, check migration status
  console.log('\n📋 Listing migration status:');
  execSync(`npx wrangler d1 migrations list ${databaseName} --env production`, { 
    stdio: 'inherit',
    shell: true 
  });
  
  // Apply only the user_tiers.sql migration if needed
  console.log('\n🔄 Applying only the user_tiers migration...');
  execSync(`npx wrangler d1 execute ${databaseName} --env production --command "SELECT name FROM sqlite_master WHERE type='table' AND name='user_tiers';"`, {
    stdio: 'inherit',
    shell: true
  });
  
  console.log('\n⚠️ If the user_tiers table does not exist, we need to apply the migration.');
  console.log('\n⚠️ To manually apply just the user_tiers migration, run:');
  console.log(`npx wrangler d1 execute ${databaseName} --env production --file ./migrations/user_tiers.sql`);
  
  const userInput = process.argv[2];
  if (userInput === '--apply-user-tiers') {
    console.log('\n🔄 Applying user_tiers migration...');
    execSync(`npx wrangler d1 execute ${databaseName} --env production --file ./migrations/user_tiers.sql`, {
      stdio: 'inherit',
      shell: true
    });
    console.log('✅ user_tiers migration applied successfully!');
  }
  
  // Step 2: Build the deploy command with full path to npx
  console.log('\n🚀 Deploying worker...');
  const npxPath = 'npx';
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

  // Execute the deploy command
  execSync(deployCommand, { stdio: 'inherit', shell: true });
  console.log('✅ Worker deployed successfully!');
  
  // Step 3: Test the tier endpoint
  console.log('\n🧪 Testing tier endpoint...');
  console.log('To test the tier endpoint, run the following command:');
  console.log(`curl -X POST "https://auth.pollinations.ai/api/user-tier" \\
  -H "Authorization: Bearer ${envVars.ADMIN_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "5099901", "tier": "flower"}'`);
  
  console.log('\n✨ Deployment process completed successfully!');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
