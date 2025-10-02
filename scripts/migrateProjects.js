#!/usr/bin/env node

/**
 * Project Data Migration Script
 * 
 * Simple migration script that works with existing project data
 * until the full project categories are implemented
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main migration function
 */
async function migrateProjects() {
  console.log('🚀 Starting project data migration...');
  
  try {
    // Read existing project data from pollinations.ai React app
    const projectDataPath = path.join(__dirname, '../pollinations.ai/src/data/projectsData.js');
    
    if (!fs.existsSync(projectDataPath)) {
      console.log('⚠️  No project data file found, creating sample data...');
      
      // Create sample project data if it doesn't exist
      const sampleData = {
        projects: [],
        categories: [
          "vibeCoding",
          "creative", 
          "games",
          "hackAndBuild",
          "chat",
          "socialBots",
          "learn"
        ],
        lastUpdated: new Date().toISOString(),
        totalProjects: 0
      };
      
      // Ensure shared/data directory exists
      const sharedDataDir = path.join(__dirname, '../shared/data');
      if (!fs.existsSync(sharedDataDir)) {
        fs.mkdirSync(sharedDataDir, { recursive: true });
      }
      
      // Write to shared data file
      const outputPath = path.join(__dirname, '../shared/data/projects.json');
      fs.writeFileSync(outputPath, JSON.stringify(sampleData, null, 2));
      
      console.log('✅ Created sample project data structure');
      return;
    }
    
    // Read the project data file
    const projectFileContent = fs.readFileSync(projectDataPath, 'utf8');
    
    // Extract the projectsData array using regex (simple approach)
    const projectsMatch = projectFileContent.match(/export const projectsData = (\[[\s\S]*?\]);/);
    
    if (!projectsMatch) {
      console.log('⚠️  Could not parse project data from file');
      return;
    }
    
    // Parse the projects data
    let projectsData;
    try {
      // Remove the export statement and evaluate the array
      const projectsArrayString = projectsMatch[1];
      projectsData = eval(projectsArrayString);
    } catch (parseError) {
      console.log('⚠️  Could not parse projects array:', parseError.message);
      projectsData = [];
    }
    
    const migratedData = {
      projects: projectsData,
      categories: [
        "vibeCoding",
        "creative", 
        "games",
        "hackAndBuild",
        "chat",
        "socialBots",
        "learn"
      ],
      lastUpdated: new Date().toISOString(),
      totalProjects: projectsData.length,
      analytics: {
        projectsByCategory: {},
        projectsByTechStack: {},
        projectsByPlatform: {},
        featuredProjects: projectsData.filter(p => p.featured).length,
        totalStars: projectsData.reduce((sum, p) => sum + (p.stars || 0), 0)
      }
    };
    
    // Calculate analytics
    projectsData.forEach(project => {
      // Count by category
      if (project.category) {
        migratedData.analytics.projectsByCategory[project.category] = 
          (migratedData.analytics.projectsByCategory[project.category] || 0) + 1;
      }
      
      // Count by tech stack
      if (project.tags) {
        project.tags.forEach(tag => {
          migratedData.analytics.projectsByTechStack[tag] = 
            (migratedData.analytics.projectsByTechStack[tag] || 0) + 1;
        });
      }
      
      // Count by platform
      if (project.platforms) {
        project.platforms.forEach(platform => {
          migratedData.analytics.projectsByPlatform[platform] = 
            (migratedData.analytics.projectsByPlatform[platform] || 0) + 1;
        });
      }
    });
    
    // Ensure shared/data directory exists
    const sharedDataDir = path.join(__dirname, '../shared/data');
    if (!fs.existsSync(sharedDataDir)) {
      fs.mkdirSync(sharedDataDir, { recursive: true });
    }
    
    // Write migrated data to shared location
    const outputPath = path.join(__dirname, '../shared/data/projects.json');
    fs.writeFileSync(outputPath, JSON.stringify(migratedData, null, 2));
    
    // Write analytics separately
    const analyticsPath = path.join(__dirname, '../shared/data/projectAnalytics.json');
    fs.writeFileSync(analyticsPath, JSON.stringify(migratedData.analytics, null, 2));
    
    console.log('✅ Migration completed successfully!');
    console.log(`📊 Migrated ${migratedData.totalProjects} projects`);
    console.log(`📁 Output: ${outputPath}`);
    
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