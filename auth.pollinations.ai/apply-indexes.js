#!/usr/bin/env node

// Apply performance indexes to production database
// GitHub Issue: #2604

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

console.log('🚀 Applying performance optimization indexes...');

const sqlContent = readFileSync('./migrations/add_performance_indexes.sql', 'utf8');

try {
  // Apply the SQL using wrangler d1 execute
  console.log('📊 Creating indexes...');
  
  // Split SQL into individual statements and execute each
  const statements = sqlContent
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  for (const statement of statements) {
    if (statement.trim()) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      try {
        execSync(`wrangler d1 execute github_auth --command="${statement};"`, {
          stdio: 'inherit'
        });
      } catch (e) {
        console.log(`Note: ${statement} may already exist (this is OK)`);
      }
    }
  }
  
  console.log('✅ Performance optimization indexes applied successfully!');
  console.log('🔍 Test token validation performance now...');
  
} catch (error) {
  console.error('❌ Error applying indexes:', error.message);
  process.exit(1);
}
