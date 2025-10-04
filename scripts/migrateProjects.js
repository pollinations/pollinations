#!/usr/bin/env node

/**
 * Project Data Migration Script - Mini    console.log('✅ Migration completed successfully!');
    console.log(`📊 Created: pollinations.ai/src/config/projectsData.js`);
    console.log(`📈 Created: pollinations.ai/src/config/projectAnalytics.js`); Version
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
    // Use the proper config directory (same as other config files)
    const configDataDir = process.env.GITHUB_ACTIONS 
      ? path.join(process.cwd(), 'pollinations.ai/src/config')
      : path.join(__dirname, '../pollinations.ai/src/config');
    
    if (!fs.existsSync(configDataDir)) {
      console.error('❌ Config directory not found:', configDataDir);
      process.exit(1);
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
    
    // Write files to config directory as .js modules (same pattern as other config files)
    const projectsFileContent = `/**
 * Auto-generated project data
 * Last updated: ${new Date().toISOString()}
 */
export const projectsData = ${JSON.stringify(projectsData, null, 2)};
`;

    const analyticsFileContent = `/**
 * Auto-generated project analytics
 * Generated at: ${new Date().toISOString()}
 */
export const projectAnalytics = ${JSON.stringify(analyticsData, null, 2)};
`;

    fs.writeFileSync(
      path.join(configDataDir, 'projectsData.js'), 
      projectsFileContent
    );
    
    fs.writeFileSync(
      path.join(configDataDir, 'projectAnalytics.js'), 
      analyticsFileContent
    );
    
    console.log('✅ Migration completed successfully!');
    console.log(`📊 Created: pollinations.ai/src/config/projectsData.json`);
    console.log(`� Created: pollinations.ai/src/config/projectAnalytics.json`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly  
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('migrateProjects.js')) {
  migrateProjects().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { migrateProjects };