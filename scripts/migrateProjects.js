#!/usr/bin/env node

/**
 * Project Data Migration Script - Minimal Version
 * Simple script to create the JSON files needed by GitHub Actions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateProjects() {
  console.log('🚀 Starting project data migration...');
  
  try {
    // Ensure shared/data directory exists
    const sharedDataDir = path.join(__dirname, '../shared/data');
    if (!fs.existsSync(sharedDataDir)) {
      fs.mkdirSync(sharedDataDir, { recursive: true });
    }
    
    // Create minimal projects data structure
    const projectsData = {
      projects: [],
      categories: ["vibeCoding", "creative", "games", "hackAndBuild", "chat", "socialBots", "learn"],
      lastUpdated: new Date().toISOString(),
      totalProjects: 0
    };
    
    const analyticsData = {
      totalProjects: 0,
      projectsByCategory: {},
      generatedAt: new Date().toISOString()
    };
    
    // Write files
    fs.writeFileSync(
      path.join(sharedDataDir, 'projects.json'), 
      JSON.stringify(projectsData, null, 2)
    );
    
    fs.writeFileSync(
      path.join(sharedDataDir, 'projectAnalytics.json'), 
      JSON.stringify(analyticsData, null, 2)
    );
    
    console.log('✅ Migration completed successfully!');
    console.log(`� Created: shared/data/projects.json`);
    console.log(`📁 Created: shared/data/projectAnalytics.json`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateProjects().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { migrateProjects };