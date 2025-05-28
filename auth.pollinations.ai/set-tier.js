#!/usr/bin/env node

const { execSync } = require('child_process');

// Configuration
const userId = process.argv[2] || '5099901'; // Default to voodoohop's GitHub ID
const tier = process.argv[3] || 'flower';    // Default to 'flower' tier
const databaseName = 'github_auth';

// Validate tier
if (!['seed', 'flower', 'nectar'].includes(tier)) {
  console.error('Error: Tier must be one of: seed, flower, nectar');
  process.exit(1);
}

console.log(`Setting tier for user ${userId} to ${tier}...`);

// SQL command to insert or update the user tier
const sqlCommand = `
INSERT INTO user_tiers (user_id, tier, updated_at)
VALUES ('${userId}', '${tier}', CURRENT_TIMESTAMP)
ON CONFLICT(user_id) DO UPDATE SET
  tier = '${tier}',
  updated_at = CURRENT_TIMESTAMP;
`;

try {
  // Execute the SQL command
  execSync(`npx wrangler d1 execute ${databaseName} --env production --command "${sqlCommand}"`, {
    stdio: 'inherit',
    shell: true
  });
  
  console.log(`✅ Successfully set tier for user ${userId} to ${tier}`);
  
  // Verify the tier was set correctly
  console.log('\nVerifying tier...');
  execSync(`npx wrangler d1 execute ${databaseName} --env production --command "SELECT * FROM user_tiers WHERE user_id = '${userId}'"`, {
    stdio: 'inherit',
    shell: true
  });
} catch (error) {
  console.error('❌ Error setting tier:', error.message);
  process.exit(1);
}
