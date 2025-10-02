#!/usr/bin/env node

/**
 * Project Submission Processor
 * 
 * Processes GitHub issue submissions and adds valid projects
 * to the structured data automatically
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse GitHub issue body to extract project information
 */
function parseIssueBody(issueBody) {
  const project = {};
  
  // Extract fields using regex patterns
  const patterns = {
    name: /### Project Name\s*\n\s*(.+)/i,
    url: /### Project URL\s*\n\s*(.+)/i,
    description: /### Project Description\s*\n\s*([\s\S]*?)(?=\n###|\n---|\n$)/i,
    author: /### Creator\/Author\s*\n\s*(.+)/i,
    repo: /### GitHub Repository.*?\n\s*(.+)/i,
    category: /### Project Category\s*\n\s*(.+)/i,
    platforms: /### Platforms\s*\n([\s\S]*?)(?=\n###)/i,
    pollinationsFeatures: /### Pollinations Features Used\s*\n([\s\S]*?)(?=\n###)/i,
    accessType: /### Access Type\s*\n([\s\S]*?)(?=\n###)/i,
    techStack: /### Technology Stack\s*\n\s*([\s\S]*?)(?=\n###|\n---|\n$)/i
  };

  // Extract basic fields
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = issueBody.match(pattern);
    if (match && match[1]) {
      project[field] = match[1].trim();
    }
  }

  // Parse checkbox fields
  if (project.platforms) {
    project.platforms = parseCheckboxes(project.platforms);
  }
  
  if (project.pollinationsFeatures) {
    project.pollinationsFeatures = parseCheckboxes(project.pollinationsFeatures);
  }
  
  if (project.accessType) {
    project.accessType = parseCheckboxes(project.accessType)[0]?.toLowerCase();
  }

  // Parse category
  if (project.category) {
    const categoryMap = {
      'vibe coding': 'vibeCoding',
      'creative': 'creative',
      'games': 'games', 
      'hack & build': 'hackAndBuild',
      'hack-&-build': 'hackAndBuild',
      'chat': 'chat',
      'social bots': 'socialBots',
      'learn': 'learn'
    };
    
    const normalizedCategory = project.category.toLowerCase();
    for (const [key, value] of Object.entries(categoryMap)) {
      if (normalizedCategory.includes(key)) {
        project.category = value;
        break;
      }
    }
  }

  // Generate additional metadata
  project.id = generateProjectId(project.name);
  project.submissionDate = new Date().toISOString().split('T')[0];
  project.language = 'en-US';
  project.status = 'active';
  project.verified = false;
  project.order = 3;

  return project;
}

/**
 * Parse checkbox lists from issue body
 */
function parseCheckboxes(text) {
  const checked = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const match = line.match(/- \[x\]\s*(.+)/i);
    if (match) {
      checked.push(match[1].trim());
    }
  }
  
  return checked;
}

/**
 * Generate unique project ID
 */
function generateProjectId(name) {
  const cleanName = name.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
    
  const timestamp = Date.now().toString().slice(-6);
  return `${cleanName}-${timestamp}`;
}

/**
 * Validate project data
 */
function validateProject(project) {
  const errors = [];
  
  // Required fields
  if (!project.name) errors.push('Project name is required');
  if (!project.url) errors.push('Project URL is required');
  if (!project.description) errors.push('Project description is required');
  if (!project.author) errors.push('Creator/author is required');
  if (!project.category) errors.push('Project category is required');
  
  // URL validation
  if (project.url && !isValidUrl(project.url)) {
    errors.push('Project URL is not valid');
  }
  
  if (project.repo && !isValidUrl(project.repo)) {
    errors.push('Repository URL is not valid');
  }
  
  // Description length
  if (project.description && project.description.length < 50) {
    errors.push('Description must be at least 50 characters long');
  }
  
  if (project.description && project.description.length > 500) {
    errors.push('Description must be less than 500 characters long');
  }
  
  return errors;
}

/**
 * Check if URL is valid
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Check for duplicate projects
 */
function isDuplicateProject(project, existingProjects) {
  return existingProjects.some(existing => 
    existing.url === project.url || 
    existing.name.toLowerCase() === project.name.toLowerCase()
  );
}

/**
 * Process project submission from GitHub issue
 */
export async function processProjectSubmission(issueNumber, issueBody, dryRun = true) {
  console.log(`🔄 Processing project submission from issue #${issueNumber}...`);
  
  try {
    // Parse project data from issue
    const project = parseIssueBody(issueBody);
    console.log('📋 Parsed project data:', project.name);
    
    // Validate project
    const validationErrors = validateProject(project);
    if (validationErrors.length > 0) {
      console.error('❌ Validation failed:', validationErrors);
      return {
        success: false,
        errors: validationErrors,
        project: null
      };
    }
    
    // Load existing projects data
    const projectsDataPath = path.join(__dirname, '../shared/data/projects.json');
    const projectsData = JSON.parse(await fs.promises.readFile(projectsDataPath, 'utf8'));
    
    // Check for duplicates
    if (isDuplicateProject(project, projectsData.projects)) {
      console.error('❌ Duplicate project detected');
      return {
        success: false,
        errors: ['Project already exists in the database'],
        project: null
      };
    }
    
    if (dryRun) {
      console.log('🔍 Dry run - would add project:', project);
      return {
        success: true,
        dryRun: true,
        project,
        message: 'Project validation passed (dry run)'
      };
    }
    
    // Add project to data
    projectsData.projects.push(project);
    projectsData.metadata.totalProjects = projectsData.projects.length;
    projectsData.metadata.lastUpdated = new Date().toISOString().split('T')[0];
    
    // Update category counts
    projectsData.categories.forEach(category => {
      category.projectCount = projectsData.projects.filter(p => p.category === category.id).length;
    });
    
    // Save updated data
    await fs.promises.writeFile(
      projectsDataPath, 
      JSON.stringify(projectsData, null, 2), 
      'utf8'
    );
    
    console.log('✅ Project added successfully!');
    return {
      success: true,
      project,
      message: `Project "${project.name}" added to the ecosystem`
    };
    
  } catch (error) {
    console.error('❌ Error processing submission:', error);
    return {
      success: false,
      errors: [error.message],
      project: null
    };
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const argMap = {};
  
  args.forEach(arg => {
    const [key, value] = arg.split('=');
    argMap[key.replace('--', '')] = value;
  });
  
  const issueNumber = argMap['issue-number'];
  const issueBody = argMap['issue-body'];
  const dryRun = argMap['dry-run'] !== 'false';
  
  if (!issueNumber || !issueBody) {
    console.error('Usage: node processProjectSubmission.js --issue-number=123 --issue-body="..." [--dry-run=true]');
    process.exit(1);
  }
  
  const result = await processProjectSubmission(issueNumber, issueBody, dryRun);
  
  if (!result.success) {
    console.error('Submission processing failed');
    process.exit(1);
  }
  
  console.log('Submission processed successfully');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { processProjectSubmission, parseIssueBody, validateProject };