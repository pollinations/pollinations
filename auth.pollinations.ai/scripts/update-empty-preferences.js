#!/usr/bin/env node

// Script to update all empty preferences objects to { "ads": true }
// Directly executes the SQL migration using wrangler

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Database info from deploy-with-migrations.js
const databaseName = "github_auth";

// Path to the migration file
const migrationFilePath = path.join(__dirname, '..', 'migrations', 'update_empty_preferences_to_ads_true.sql');

console.log('Starting update of empty preferences to { "ads": true }...');
console.log(`Using migration file: ${migrationFilePath}`);

try {
  // Execute the SQL file against the D1 database
  console.log('\n🔄 Applying migration to update empty preferences...');
  execSync(`npx wrangler d1 execute ${databaseName} --env production --remote --file ${migrationFilePath}`, {
    stdio: 'inherit',
    shell: true
  });
  
  console.log('\n✅ Migration completed successfully!');
  console.log('All empty preference objects have been updated to { "ads": true }');
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
}
