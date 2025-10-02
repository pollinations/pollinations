#!/usr/bin/env node

/**
 * Project Data Migration Script
 * 
 * Converts all existing project data from the individual category files
 * to the new structured JSON format with enhanced metadata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import existing project data
import { vibeCodingProjects } from '../pollinations.ai/src/config/projects/vibeCoding.js';
import { creativeProjects } from '../pollinations.ai/src/config/projects/creative.js';
import { gamesProjects } from '../pollinations.ai/src/config/projects/games.js';
import { hackAndBuildProjects } from '../pollinations.ai/src/config/projects/hackAndBuild.js';
import { chatProjects } from '../pollinations.ai/src/config/projects/chat.js';
import { socialBotsProjects } from '../pollinations.ai/src/config/projects/socialBots.js';
import { learnProjects } from '../pollinations.ai/src/config/projects/learn.js';

import { DataMigration } from '../shared/data/projectsData.js';
import { ProjectValidation } from '../shared/schemas/projectSchema.js';

/**
 * Main migration function
 */
async function migrateProjects() {
  console.log('🚀 Starting project data migration...');
  
  const legacyData = {
    vibeCoding: vibeCodingProjects,
    creative: creativeProjects,
    games: gamesProjects,
    hackAndBuild: hackAndBuildProjects,
    chat: chatProjects,
    socialBots: socialBotsProjects,
    learn: learnProjects
  };

  const migratedProjects = [];
  const migrationStats = {
    total: 0,
    successful: 0,
    errors: 0,
    warnings: []
  };

  // Process each category
  for (const [categoryId, projects] of Object.entries(legacyData)) {
    console.log(`\n📂 Processing ${categoryId} category (${projects.length} projects)...`);
    
    for (const legacyProject of projects) {
      try {
        migrationStats.total++;
        
        // Convert legacy project to new format
        const migratedProject = DataMigration.convertLegacyProject(legacyProject, categoryId);
        
        // Validate the migrated project
        const validationErrors = ProjectValidation.validate(migratedProject);
        if (validationErrors.length > 0) {
          migrationStats.warnings.push({
            project: migratedProject.name,
            errors: validationErrors
          });
          console.log(`  ⚠️  ${migratedProject.name}: ${validationErrors.join(', ')}`);
        }
        
        migratedProjects.push(migratedProject);
        migrationStats.successful++;
        console.log(`  ✅ ${migratedProject.name}`);
        
      } catch (error) {
        migrationStats.errors++;
        console.error(`  ❌ Failed to migrate ${legacyProject.name}: ${error.message}`);
      }
    }
  }

  // Create the final data structure
  const finalData = {
    metadata: {
      version: "2.0.0",
      lastUpdated: new Date().toISOString().split('T')[0],
      totalProjects: migratedProjects.length,
      dataSource: "pollinations-community",
      schemaVersion: "1.0.0",
      migrationDate: new Date().toISOString(),
      statistics: {
        totalMigrated: migrationStats.successful,
        totalErrors: migrationStats.errors,
        totalWarnings: migrationStats.warnings.length
      }
    },
    
    categories: [
      {
        id: "vibeCoding",
        title: "Vibe Coding ✨",
        description: "No-code / describe-to-code playgrounds and builders",
        icon: "✨",
        color: "#FF6B6B",
        projectCount: migratedProjects.filter(p => p.category === 'vibeCoding').length
      },
      {
        id: "creative", 
        title: "Creative 🎨",
        description: "Turn prompts into images, video, music, design, slides",
        icon: "🎨",
        color: "#4ECDC4",
        projectCount: migratedProjects.filter(p => p.category === 'creative').length
      },
      {
        id: "games",
        title: "Games 🎲", 
        description: "AI-powered play, interactive fiction, puzzle & agent worlds",
        icon: "🎲",
        color: "#45B7D1",
        projectCount: migratedProjects.filter(p => p.category === 'games').length
      },
      {
        id: "hackAndBuild",
        title: "Hack-&-Build 🛠️",
        description: "SDKs, integration libs, extensions, dashboards, MCP servers", 
        icon: "🛠️",
        color: "#96CEB4",
        projectCount: migratedProjects.filter(p => p.category === 'hackAndBuild').length
      },
      {
        id: "chat",
        title: "Chat 💬",
        description: "Standalone chat UIs / multi-model playgrounds",
        icon: "💬", 
        color: "#FECA57",
        projectCount: migratedProjects.filter(p => p.category === 'chat').length
      },
      {
        id: "socialBots",
        title: "Social Bots 🤖",
        description: "Discord / Telegram / WhatsApp / Roblox bots & NPCs",
        icon: "🤖",
        color: "#FF9FF3",
        projectCount: migratedProjects.filter(p => p.category === 'socialBots').length
      },
      {
        id: "learn",
        title: "Learn 📚",
        description: "Tutorials, guides, style books & educational demos",
        icon: "📚",
        color: "#54A0FF",
        projectCount: migratedProjects.filter(p => p.category === 'learn').length
      }
    ],

    projects: migratedProjects.sort((a, b) => {
      // Sort by category, then by order, then by stars
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return (b.stars || 0) - (a.stars || 0);
    })
  };

  // Write the migrated data to JSON file
  const outputPath = path.join(__dirname, '../shared/data/projects.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(finalData, null, 2), 'utf8');

  // Generate TypeScript definitions
  await generateTypeDefinitions(outputPath.replace('.json', '.d.ts'));

  // Create analytics data
  await generateAnalytics(finalData, path.join(__dirname, '../shared/data/projectAnalytics.json'));

  // Print migration summary
  console.log('\n🎉 Migration completed!');
  console.log(`📊 Migration Summary:`);
  console.log(`   Total projects processed: ${migrationStats.total}`);
  console.log(`   Successfully migrated: ${migrationStats.successful}`);
  console.log(`   Errors: ${migrationStats.errors}`);
  console.log(`   Warnings: ${migrationStats.warnings.length}`);
  console.log(`   Output file: ${outputPath}`);

  if (migrationStats.warnings.length > 0) {
    console.log('\n⚠️  Validation Warnings:');
    migrationStats.warnings.forEach(warning => {
      console.log(`   ${warning.project}: ${warning.errors.join(', ')}`);
    });
  }

  return finalData;
}

/**
 * Generate TypeScript definitions for the data structure
 */
async function generateTypeDefinitions(outputPath) {
  const typeDefinitions = `
/**
 * TypeScript definitions for Pollinations Projects Data
 * Auto-generated on ${new Date().toISOString()}
 */

export interface ProjectMetadata {
  version: string;
  lastUpdated: string;
  totalProjects: number;
  dataSource: string;
  schemaVersion: string;
  migrationDate: string;
  statistics: {
    totalMigrated: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

export interface ProjectCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  projectCount: number;
}

export interface TechStack {
  frontend?: string[];
  backend?: string[];
  database?: string[];
  deployment?: string[];
  aiModels?: string[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  techStack: TechStack;
  platforms: string[];
  accessType: string;
  pollinationsFeatures: string[];
  userBase: string;
  difficulty: string;
  repo?: string;
  stars?: number;
  submissionDate?: string;
  lastUpdated?: string;
  language: string;
  status: string;
  featured?: boolean;
  hidden?: boolean;
  order: number;
  verified: boolean;
  isNew?: boolean;
  searchText?: string;
  qualityScore?: number;
}

export interface ProjectsData {
  metadata: ProjectMetadata;
  categories: ProjectCategory[];
  projects: Project[];
}

export default ProjectsData;
`;

  await fs.promises.writeFile(outputPath, typeDefinitions, 'utf8');
  console.log(`📝 TypeScript definitions generated: ${outputPath}`);
}

/**
 * Generate analytics and statistics
 */
async function generateAnalytics(data, outputPath) {
  const analytics = {
    overview: {
      totalProjects: data.projects.length,
      totalCategories: data.categories.length,
      averageProjectsPerCategory: Math.round(data.projects.length / data.categories.length),
      totalStars: data.projects.reduce((sum, p) => sum + (p.stars || 0), 0),
      featuredProjects: data.projects.filter(p => p.featured).length,
      verifiedProjects: data.projects.filter(p => p.verified).length,
      newProjects: data.projects.filter(p => p.isNew).length
    },
    
    categories: data.categories.map(cat => ({
      id: cat.id,
      title: cat.title,
      projectCount: cat.projectCount,
      percentage: Math.round((cat.projectCount / data.projects.length) * 100)
    })),
    
    technologies: {
      topTags: getTopTags(data.projects, 20),
      topPlatforms: getTopPlatforms(data.projects),
      topTechStack: getTopTechStack(data.projects)
    },
    
    engagement: {
      topStarred: data.projects
        .filter(p => p.stars)
        .sort((a, b) => (b.stars || 0) - (a.stars || 0))
        .slice(0, 10)
        .map(p => ({ name: p.name, stars: p.stars, category: p.category })),
      
      qualityDistribution: getQualityDistribution(data.projects),
      difficultyBreakdown: getDifficultyBreakdown(data.projects),
      accessTypeBreakdown: getAccessTypeBreakdown(data.projects)
    },
    
    trends: {
      submissionsByMonth: getSubmissionTrends(data.projects),
      categoriesGrowth: getCategoryGrowthTrends(data.projects)
    },
    
    generatedAt: new Date().toISOString()
  };

  await fs.promises.writeFile(outputPath, JSON.stringify(analytics, null, 2), 'utf8');
  console.log(`📈 Analytics generated: ${outputPath}`);
}

// Analytics helper functions
function getTopTags(projects, limit = 10) {
  const tagCounts = {};
  projects.forEach(p => {
    p.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  
  return Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count, percentage: Math.round((count / projects.length) * 100) }));
}

function getTopPlatforms(projects) {
  const platformCounts = {};
  projects.forEach(p => {
    p.platforms.forEach(platform => {
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    });
  });
  
  return Object.entries(platformCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([platform, count]) => ({ platform, count, percentage: Math.round((count / projects.length) * 100) }));
}

function getTopTechStack(projects) {
  const techCounts = {};
  projects.forEach(p => {
    Object.values(p.techStack).flat().forEach(tech => {
      if (tech) {
        techCounts[tech] = (techCounts[tech] || 0) + 1;
      }
    });
  });
  
  return Object.entries(techCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .map(([tech, count]) => ({ tech, count }));
}

function getQualityDistribution(projects) {
  const distribution = { high: 0, medium: 0, low: 0 };
  projects.forEach(p => {
    const score = p.qualityScore || 50;
    if (score >= 80) distribution.high++;
    else if (score >= 60) distribution.medium++;
    else distribution.low++;
  });
  return distribution;
}

function getDifficultyBreakdown(projects) {
  const breakdown = {};
  projects.forEach(p => {
    breakdown[p.difficulty] = (breakdown[p.difficulty] || 0) + 1;
  });
  return breakdown;
}

function getAccessTypeBreakdown(projects) {
  const breakdown = {};
  projects.forEach(p => {
    breakdown[p.accessType] = (breakdown[p.accessType] || 0) + 1;
  });
  return breakdown;
}

function getSubmissionTrends(projects) {
  const trends = {};
  projects.forEach(p => {
    if (p.submissionDate) {
      const month = p.submissionDate.substring(0, 7); // YYYY-MM
      trends[month] = (trends[month] || 0) + 1;
    }
  });
  return trends;
}

function getCategoryGrowthTrends(projects) {
  const trends = {};
  projects.forEach(p => {
    if (p.submissionDate) {
      const month = p.submissionDate.substring(0, 7);
      if (!trends[month]) trends[month] = {};
      trends[month][p.category] = (trends[month][p.category] || 0) + 1;
    }
  });
  return trends;
}

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateProjects().catch(console.error);
}

export { migrateProjects, generateAnalytics };