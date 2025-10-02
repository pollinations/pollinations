#!/usr/bin/env node

/**
 * Project Data Validator
 * 
 * Validates the integrity and quality of the projects data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectValidation } from '../shared/schemas/projectSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Comprehensive data validation
 */
export async function validateProjectData() {
  console.log('🔍 Validating project data...');
  
  try {
    // Load projects data
    const projectsDataPath = path.join(__dirname, '../shared/data/projects.json');
    const projectsData = JSON.parse(await fs.promises.readFile(projectsDataPath, 'utf8'));
    
    const results = {
      totalProjects: projectsData.projects.length,
      validProjects: 0,
      errors: [],
      warnings: [],
      duplicates: [],
      brokenLinks: [],
      qualityIssues: []
    };
    
    // Track seen projects for duplicate detection
    const seenUrls = new Set();
    const seenNames = new Set();
    
    // Validate each project
    for (let i = 0; i < projectsData.projects.length; i++) {
      const project = projectsData.projects[i];
      const projectRef = `Project ${i + 1}: "${project.name}"`;
      
      // Basic validation
      const validationErrors = ProjectValidation.validate(project);
      if (validationErrors.length > 0) {
        results.errors.push({
          project: projectRef,
          errors: validationErrors
        });
        continue;
      }
      
      // Duplicate detection
      if (seenUrls.has(project.url)) {
        results.duplicates.push({
          project: projectRef,
          issue: 'Duplicate URL',
          url: project.url
        });
      }
      seenUrls.add(project.url);
      
      const normalizedName = project.name.toLowerCase().replace(/[^\w]/g, '');
      if (seenNames.has(normalizedName)) {
        results.duplicates.push({
          project: projectRef,
          issue: 'Duplicate name',
          name: project.name
        });
      }
      seenNames.add(normalizedName);
      
      // Quality checks
      const qualityIssues = validateProjectQuality(project);
      if (qualityIssues.length > 0) {
        results.qualityIssues.push({
          project: projectRef,
          issues: qualityIssues
        });
      }
      
      // Category validation
      const validCategories = projectsData.categories.map(c => c.id);
      if (!validCategories.includes(project.category)) {
        results.errors.push({
          project: projectRef,
          errors: [`Invalid category: ${project.category}`]
        });
      }
      
      results.validProjects++;
    }
    
    // Validate category consistency
    validateCategoryConsistency(projectsData, results);
    
    // Check for broken links (sample check)
    await validateSampleUrls(projectsData.projects.slice(0, 10), results);
    
    // Generate report
    generateValidationReport(results);
    
    return results;
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate project quality metrics
 */
function validateProjectQuality(project) {
  const issues = [];
  
  // Description quality
  if (project.description.length < 100) {
    issues.push('Description too short (< 100 chars)');
  }
  
  if (project.description.length > 400) {
    issues.push('Description too long (> 400 chars)');
  }
  
  // Tags quality
  if (!project.tags || project.tags.length < 2) {
    issues.push('Insufficient tags (< 2)');
  }
  
  if (project.tags && project.tags.length > 10) {
    issues.push('Too many tags (> 10)');
  }
  
  // Missing optional but recommended fields
  if (!project.repo && project.accessType === 'open-source') {
    issues.push('Open source project missing repository URL');
  }
  
  if (!project.techStack || Object.keys(project.techStack).length === 0) {
    issues.push('Missing tech stack information');
  }
  
  if (!project.platforms || project.platforms.length === 0) {
    issues.push('Missing platform information');
  }
  
  // Author format
  if (project.author && !project.author.startsWith('@') && !project.author.includes('@') && !project.author.startsWith('http')) {
    issues.push('Author should start with @ or be an email/link');
  }
  
  return issues;
}

/**
 * Validate category consistency
 */
function validateCategoryConsistency(projectsData, results) {
  // Check if category counts match actual project counts
  projectsData.categories.forEach(category => {
    const actualCount = projectsData.projects.filter(p => p.category === category.id).length;
    
    if (category.projectCount !== actualCount) {
      results.warnings.push({
        category: category.title,
        issue: `Category count mismatch: declared ${category.projectCount}, actual ${actualCount}`
      });
    }
  });
  
  // Check for projects with undefined categories
  const orphanedProjects = projectsData.projects.filter(p => 
    !projectsData.categories.some(cat => cat.id === p.category)
  );
  
  if (orphanedProjects.length > 0) {
    results.errors.push({
      project: 'Multiple projects',
      errors: [`${orphanedProjects.length} projects have invalid categories`]
    });
  }
}

/**
 * Validate sample URLs (limited to avoid rate limiting)
 */
async function validateSampleUrls(sampleProjects, results) {
  console.log('🌐 Checking sample URLs...');
  
  for (const project of sampleProjects) {
    try {
      const response = await fetch(project.url, { 
        method: 'HEAD',
        timeout: 5000 
      });
      
      if (!response.ok) {
        results.brokenLinks.push({
          project: project.name,
          url: project.url,
          status: response.status
        });
      }
    } catch (error) {
      results.brokenLinks.push({
        project: project.name,
        url: project.url,
        error: error.message
      });
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Generate validation report
 */
function generateValidationReport(results) {
  console.log('\n📊 Validation Report');
  console.log('====================');
  
  console.log(`Total projects: ${results.totalProjects}`);
  console.log(`Valid projects: ${results.validProjects}`);
  console.log(`Errors: ${results.errors.length}`);
  console.log(`Warnings: ${results.warnings.length}`);
  console.log(`Duplicates: ${results.duplicates.length}`);
  console.log(`Quality issues: ${results.qualityIssues.length}`);
  console.log(`Broken links (sample): ${results.brokenLinks.length}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(error => {
      console.log(`  ${error.project}: ${error.errors.join(', ')}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => {
      console.log(`  ${warning.category || warning.project}: ${warning.issue}`);
    });
  }
  
  if (results.duplicates.length > 0) {
    console.log('\n🔄 DUPLICATES:');
    results.duplicates.forEach(dup => {
      console.log(`  ${dup.project}: ${dup.issue} - ${dup.url || dup.name}`);
    });
  }
  
  if (results.qualityIssues.length > 0) {
    console.log('\n📈 QUALITY ISSUES:');
    results.qualityIssues.slice(0, 5).forEach(issue => {
      console.log(`  ${issue.project}: ${issue.issues.join(', ')}`);
    });
    if (results.qualityIssues.length > 5) {
      console.log(`  ... and ${results.qualityIssues.length - 5} more`);
    }
  }
  
  if (results.brokenLinks.length > 0) {
    console.log('\n🔗 BROKEN LINKS (sample):');
    results.brokenLinks.forEach(link => {
      console.log(`  ${link.project}: ${link.url} (${link.status || link.error})`);
    });
  }
  
  // Overall status
  const hasErrors = results.errors.length > 0 || results.duplicates.length > 0;
  const hasWarnings = results.warnings.length > 0 || results.qualityIssues.length > 0;
  
  if (hasErrors) {
    console.log('\n❌ VALIDATION FAILED - Critical errors found');
  } else if (hasWarnings) {
    console.log('\n⚠️  VALIDATION PASSED - Some warnings detected');
  } else {
    console.log('\n✅ VALIDATION PASSED - All checks successful');
  }
}

/**
 * CLI interface
 */
async function main() {
  const results = await validateProjectData();
  
  if (results.error) {
    process.exit(1);
  }
  
  // Exit with error code if critical issues found
  const hasErrors = results.errors.length > 0 || results.duplicates.length > 0;
  if (hasErrors) {
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { validateProjectData, validateProjectQuality };