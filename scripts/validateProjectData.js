import fs from 'fs';
import path from 'path';

/**
 * Validates project data for consistency and integrity
 * Checks for required fields, duplicate entries, invalid URLs, etc.
 */

const PROJECT_FILES_DIR = '../pollinations.ai/src/config/projects';
const REQUIRED_FIELDS = ['name', 'url', 'description', 'author'];
const OPTIONAL_FIELDS = ['repo', 'submissionDate', 'order', 'stars', 'hidden'];

// Helper function to validate URL format
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Helper function to validate GitHub repo URL
function isValidGitHubRepo(string) {
  if (!string) return true; // repo is optional
  
  try {
    const url = new URL(string);
    if (url.hostname !== 'github.com') return false;
    
    const pathParts = url.pathname.split('/').filter(part => part);
    return pathParts.length >= 2;
  } catch (_) {
    return false;
  }
}

// Helper function to validate date format (YYYY-MM-DD)
function isValidDate(dateString) {
  if (!dateString) return true; // submissionDate is optional
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Helper function to extract projects from file content
function extractProjectsFromFile(content, filename) {
  const projects = [];
  const errors = [];
  
  try {
    // Use regex to find project objects
    const projectMatches = content.matchAll(/\{\s*name:\s*["']([^"']+)["'][^}]*?\}/gs);
    
    for (const match of projectMatches) {
      try {
        // Extract the full project object
        const projectStr = match[0];
        
        // Parse individual fields using regex
        const nameMatch = projectStr.match(/name:\s*["']([^"']+)["']/);
        const urlMatch = projectStr.match(/url:\s*["']([^"']+)["']/);
        const descMatch = projectStr.match(/description:\s*["']([^"']+)["']/);
        const authorMatch = projectStr.match(/author:\s*["']([^"']+)["']/);
        const repoMatch = projectStr.match(/repo:\s*["']([^"']+)["']/);
        const dateMatch = projectStr.match(/submissionDate:\s*["']([^"']+)["']/);
        const orderMatch = projectStr.match(/order:\s*(\d+)/);
        const starsMatch = projectStr.match(/stars:\s*(\d+)/);
        const hiddenMatch = projectStr.match(/hidden:\s*(true|false)/);
        
        const project = {
          name: nameMatch ? nameMatch[1] : '',
          url: urlMatch ? urlMatch[1] : '',
          description: descMatch ? descMatch[1] : '',
          author: authorMatch ? authorMatch[1] : '',
          repo: repoMatch ? repoMatch[1] : undefined,
          submissionDate: dateMatch ? dateMatch[1] : undefined,
          order: orderMatch ? parseInt(orderMatch[1]) : undefined,
          stars: starsMatch ? parseInt(starsMatch[1]) : undefined,
          hidden: hiddenMatch ? hiddenMatch[1] === 'true' : undefined,
          _source: filename,
          _raw: projectStr
        };
        
        projects.push(project);
      } catch (error) {
        errors.push({
          file: filename,
          error: `Failed to parse project: ${error.message}`,
          context: match[0].substring(0, 100) + '...'
        });
      }
    }
  } catch (error) {
    errors.push({
      file: filename,
      error: `Failed to parse file: ${error.message}`
    });
  }
  
  return { projects, errors };
}

// Main validation function
function validateProject(project) {
  const issues = [];
  
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!project[field] || project[field].trim() === '') {
      issues.push({
        type: 'error',
        field: field,
        message: `Missing required field: ${field}`
      });
    }
  }
  
  // Validate URL format
  if (project.url && !isValidUrl(project.url)) {
    issues.push({
      type: 'error',
      field: 'url',
      message: 'Invalid URL format'
    });
  }
  
  // Validate repo URL format
  if (project.repo && !isValidGitHubRepo(project.repo)) {
    issues.push({
      type: 'error',
      field: 'repo',
      message: 'Invalid GitHub repository URL'
    });
  }
  
  // Validate submission date
  if (project.submissionDate && !isValidDate(project.submissionDate)) {
    issues.push({
      type: 'error',
      field: 'submissionDate',
      message: 'Invalid date format (should be YYYY-MM-DD)'
    });
  }
  
  // Validate order value
  if (project.order !== undefined && (project.order < 1 || project.order > 5)) {
    issues.push({
      type: 'warning',
      field: 'order',
      message: 'Order should typically be between 1-5'
    });
  }
  
  // Check description length
  if (project.description && project.description.length > 500) {
    issues.push({
      type: 'warning',
      field: 'description',
      message: 'Description is very long (>500 chars)'
    });
  }
  
  if (project.description && project.description.length < 20) {
    issues.push({
      type: 'warning',
      field: 'description',
      message: 'Description is very short (<20 chars)'
    });
  }
  
  // Check for unknown fields
  const allValidFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS, '_source', '_raw'];
  for (const field in project) {
    if (!allValidFields.includes(field)) {
      issues.push({
        type: 'warning',
        field: field,
        message: `Unknown field: ${field}`
      });
    }
  }
  
  return issues;
}

async function validateProjectData() {
  console.log('🔍 Starting project data validation...');
  
  const projectsDir = path.resolve(PROJECT_FILES_DIR);
  
  if (!fs.existsSync(projectsDir)) {
    console.error(`❌ Projects directory not found: ${projectsDir}`);
    process.exit(1);
  }
  
  const projectFiles = fs.readdirSync(projectsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(projectsDir, file));
  
  let allProjects = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let parseErrors = [];
  
  // Read and parse all project files
  for (const filePath of projectFiles) {
    const filename = path.basename(filePath);
    console.log(`\n📂 Validating ${filename}...`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { projects, errors } = extractProjectsFromFile(content, filename);
      
      if (errors.length > 0) {
        parseErrors.push(...errors);
        console.log(`  ❌ ${errors.length} parse errors`);
      }
      
      allProjects.push(...projects);
      console.log(`  📦 Found ${projects.length} projects`);
    } catch (error) {
      console.error(`  ❌ Error reading file: ${error.message}`);
      parseErrors.push({
        file: filename,
        error: `File read error: ${error.message}`
      });
    }
  }
  
  console.log(`\n📊 Total projects found: ${allProjects.length}`);
  
  // Validate each project
  console.log('\n🔍 Validating individual projects...');
  const projectIssues = [];
  
  for (const project of allProjects) {
    const issues = validateProject(project);
    if (issues.length > 0) {
      projectIssues.push({
        project: project.name,
        file: project._source,
        issues: issues
      });
    }
  }
  
  // Check for duplicates
  console.log('\n🔄 Checking for duplicates...');
  const nameMap = new Map();
  const urlMap = new Map();
  const duplicates = [];
  
  for (const project of allProjects) {
    // Check duplicate names
    if (nameMap.has(project.name)) {
      duplicates.push({
        type: 'name',
        value: project.name,
        projects: [nameMap.get(project.name), project]
      });
    } else {
      nameMap.set(project.name, project);
    }
    
    // Check duplicate URLs
    if (urlMap.has(project.url)) {
      duplicates.push({
        type: 'url',
        value: project.url,
        projects: [urlMap.get(project.url), project]
      });
    } else {
      urlMap.set(project.url, project);
    }
  }
  
  // Report results
  console.log('\n📋 VALIDATION REPORT');
  console.log('='.repeat(50));
  
  if (parseErrors.length > 0) {
    console.log(`\n❌ PARSE ERRORS (${parseErrors.length}):`);
    for (const error of parseErrors) {
      console.log(`  📄 ${error.file}: ${error.error}`);
      if (error.context) {
        console.log(`    Context: ${error.context}`);
      }
    }
  }
  
  if (projectIssues.length > 0) {
    console.log(`\n⚠️  PROJECT ISSUES (${projectIssues.length} projects):`);
    for (const { project, file, issues } of projectIssues) {
      console.log(`\n  📦 ${project} (${file}):`);
      for (const issue of issues) {
        const icon = issue.type === 'error' ? '❌' : '⚠️ ';
        console.log(`    ${icon} ${issue.field}: ${issue.message}`);
        if (issue.type === 'error') totalErrors++;
        if (issue.type === 'warning') totalWarnings++;
      }
    }
  }
  
  if (duplicates.length > 0) {
    console.log(`\n🔄 DUPLICATES (${duplicates.length}):`);
    for (const dup of duplicates) {
      console.log(`\n  🔄 Duplicate ${dup.type}: "${dup.value}"`);
      for (const project of dup.projects) {
        console.log(`    📦 ${project.name} (${project._source})`);
      }
      totalErrors++;
    }
  }
  
  // Summary
  console.log('\n📈 SUMMARY');
  console.log('='.repeat(30));
  console.log(`Projects validated: ${allProjects.length}`);
  console.log(`Parse errors: ${parseErrors.length}`);
  console.log(`Validation errors: ${totalErrors}`);
  console.log(`Validation warnings: ${totalWarnings}`);
  console.log(`Duplicates found: ${duplicates.length}`);
  
  if (totalErrors === 0 && parseErrors.length === 0) {
    console.log('\n✅ All projects are valid!');
  } else {
    console.log(`\n❌ Found ${totalErrors + parseErrors.length} critical issues that need attention`);
    if (totalWarnings > 0) {
      console.log(`⚠️  Found ${totalWarnings} warnings (non-critical)`);
    }
  }
  
  console.log('\n🎉 Validation complete!');
  
  // Exit with error code if there are critical issues
  if (totalErrors > 0 || parseErrors.length > 0) {
    process.exit(1);
  }
}

// Run the script
validateProjectData().catch(error => {
  console.error('💥 Validation script failed:', error);
  process.exit(1);
});
