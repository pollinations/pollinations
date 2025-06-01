#!/usr/bin/env node

// Script to set default preferences to { "ads": true } for all new users
// This modifies the database schema to change the default value

const { execSync } = require('child_process');
const path = require('path');

// Database info
const databaseName = "github_auth";

// Path to the migration file
const migrationFilePath = path.join(__dirname, '..', 'migrations', 'alter_preferences_default.sql');

console.log('Starting migration to set default preferences to { "ads": true } for new users...');
console.log(`Using migration file: ${migrationFilePath}`);

try {
  // Execute the SQL file against the D1 database
  console.log('\n🔄 Applying migration to change default preferences...');
  execSync(`npx wrangler d1 execute ${databaseName} --env production --remote --file ${migrationFilePath}`, {
    stdio: 'inherit',
    shell: true
  });
  
  console.log('\n✅ Migration completed successfully!');
  console.log('Default preferences for all new users set to { "ads": true }');
  console.log('A trigger has been created to automatically set preferences for new users.');
  console.log('This approach preserves all foreign key relationships in the database.');
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
}
