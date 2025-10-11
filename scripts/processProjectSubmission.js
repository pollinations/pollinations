import fs from 'fs';
import path from 'path';

/**
 * Processes new project submissions from GitHub issues
 * Parses issue body, validates project data, and adds to appropriate category file
 */

// Use path resolution that works both locally and in CI
const PROJECT_FILES_DIR = process.env.GITHUB_ACTIONS 
  ? 'pollinations.ai/src/config/projects'  // CI environment
  : '../pollinations.ai/src/config/projects'; // Local development

// Command line argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      parsed[key.substring(2)] = value;
    }
  }
  
  return parsed;
}

// Helper function to extract project data from issue body
function parseIssueBody(issueBody) {
  const project = {};
  const errors = [];
  
  // Common patterns for extracting data from markdown
  const patterns = {
    name: /(?:name|title|project\s*name):\s*(.+?)(?:\n|$)/i,
    url: /(?:url|link|website|demo):\s*(https?:\/\/[^\s\n]+)/i,
    description: /(?:description|about|summary):\s*(.+?)(?:\n\n|\n(?:[A-Z])|$)/is,
    author: /(?:author|creator|developer|by):\s*(.+?)(?:\n|$)/i,
    repo: /(?:repository|repo|github|source):\s*(https?:\/\/github\.com\/[^\s\n]+)/i,
    category: /(?:category|type|section):\s*(.+?)(?:\n|$)/i
  };
  
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = issueBody.match(pattern);
    if (match) {
      project[field] = match[1].trim();
    }
  }
  
  // Validate required fields
  const required = ['name', 'url', 'description', 'author'];
  for (const field of required) {
    if (!project[field] || project[field].trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate URL format
  if (project.url && !isValidUrl(project.url)) {
    errors.push('Invalid URL format');
  }
  
  // Validate repo URL if provided
  if (project.repo && !isValidGitHubRepo(project.repo)) {
    errors.push('Invalid GitHub repository URL');
  }
  
  // Clean and format data
  if (project.name) {
    project.name = project.name.replace(/["""]/g, '"').trim();
  }
  
  if (project.description) {
    project.description = project.description
      .replace(/["""]/g, '"')
      .replace(/\n+/g, ' ')
      .trim();
  }
  
  if (project.author && !project.author.startsWith('@')) {
    project.author = `@${project.author}`;
  }
  
  // Add submission date
  project.submissionDate = new Date().toISOString().split('T')[0];
  
  return { project, errors };
}

// Helper function to determine which category file to use
function determineCategory(project) {
  const categoryKeywords = {
    'vibeCoding': ['no-code', 'low-code', 'builder', 'playground', 'visual', 'drag-drop'],
    'creative': ['image', 'art', 'design', 'music', 'video', 'photo', 'creative', 'generate'],
    'games': ['game', 'gaming', 'play', 'interactive', 'puzzle', 'rpg'],
    'hackAndBuild': ['api', 'sdk', 'library', 'framework', 'extension', 'tool', 'dev'],
    'chat': ['chat', 'conversation', 'messaging', 'talk', 'assistant'],
    'socialBots': ['bot', 'discord', 'telegram', 'whatsapp', 'social', 'automation'],
    'learn': ['tutorial', 'guide', 'learn', 'education', 'course', 'teaching']
  };
  
  const text = `${project.name} ${project.description}`.toLowerCase();
  
  // Check explicit category mention
  if (project.category) {
    const categoryLower = project.category.toLowerCase();
    for (const [key, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => categoryLower.includes(keyword)) || 
          categoryLower.includes(key.toLowerCase())) {
        return key;
      }
    }
  }
  
  // Auto-detect based on keywords
  let bestMatch = 'hackAndBuild'; // default
  let maxScore = 0;
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.reduce((acc, keyword) => {
      return acc + (text.includes(keyword) ? 1 : 0);
    }, 0);
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = category;
    }
  }
  
  return bestMatch;
}

// Helper function to format project object for insertion
function formatProjectForInsertion(project) {
  const lines = ['  {'];
  
  lines.push(`    name: "${project.name}",`);
  lines.push(`    url: "${project.url}",`);
  lines.push(`    description: "${project.description}",`);
  lines.push(`    author: "${project.author}",`);
  
  if (project.repo) {
    lines.push(`    repo: "${project.repo}",`);
  }
  
  lines.push(`    submissionDate: "${project.submissionDate}",`);
  lines.push(`    order: 3`); // Default order for new submissions
  
  lines.push('  }');
  
  return lines.join('\n');
}

// Helper function to add project to category file
function addProjectToFile(categoryFile, project) {
  const filePath = path.resolve(PROJECT_FILES_DIR, `${categoryFile}.js`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Category file not found: ${categoryFile}.js`);
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Find the export array and insert before the closing bracket
  const arrayEndPattern = /(\n\s*\];?\s*)$/;
  const match = content.match(arrayEndPattern);
  
  if (!match) {
    throw new Error(`Could not find array end in ${categoryFile}.js`);
  }
  
  const projectStr = formatProjectForInsertion(project);
  const insertPosition = content.lastIndexOf(match[0]);
  
  // Insert the new project (add comma if there are existing projects)
  const beforeInsert = content.substring(0, insertPosition);
  const hasExistingProjects = beforeInsert.includes('{');
  
  const newProject = (hasExistingProjects ? ',\n' : '') + projectStr;
  const newContent = beforeInsert + newProject + match[0];
  
  fs.writeFileSync(filePath, newContent, 'utf-8');
  
  return filePath;
}

// Helper validation functions
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isValidGitHubRepo(string) {
  try {
    const url = new URL(string);
    if (url.hostname !== 'github.com') return false;
    const pathParts = url.pathname.split('/').filter(part => part);
    return pathParts.length >= 2;
  } catch (_) {
    return false;
  }
}

async function processProjectSubmission() {
  console.log('📝 Processing project submission...');
  
  const args = parseArgs();
  const { 'issue-number': issueNumber, 'issue-body': issueBody, 'dry-run': dryRun } = args;
  
  if (!issueNumber || !issueBody) {
    console.error('❌ Missing required arguments: --issue-number and --issue-body');
    process.exit(1);
  }
  
  console.log(`📋 Processing issue #${issueNumber}`);
  console.log(`🔍 Dry run: ${dryRun === 'true'}`);
  
  // Parse the issue body
  const { project, errors } = parseIssueBody(issueBody);
  
  if (errors.length > 0) {
    console.log('\n❌ Validation errors:');
    for (const error of errors) {
      console.log(`  • ${error}`);
    }
    
    console.log('\n📝 Parsed data:');
    console.log(JSON.stringify(project, null, 2));
    
    console.log('\n💡 Please fix the errors in the issue and resubmit.');
    process.exit(1);
  }
  
  // Determine category
  const category = determineCategory(project);
  console.log(`📂 Auto-detected category: ${category}`);
  
  console.log('\n📋 Project details:');
  console.log(`  Name: ${project.name}`);
  console.log(`  URL: ${project.url}`);
  console.log(`  Author: ${project.author}`);
  console.log(`  Description: ${project.description.substring(0, 100)}...`);
  if (project.repo) {
    console.log(`  Repository: ${project.repo}`);
  }
  console.log(`  Submission Date: ${project.submissionDate}`);
  
  if (dryRun === 'true') {
    console.log('\n🔍 DRY RUN - No files will be modified');
    console.log('\nGenerated project entry:');
    console.log(formatProjectForInsertion(project));
    console.log(`\nWould be added to: ${category}.js`);
  } else {
    try {
      const filePath = addProjectToFile(category, project);
      console.log(`\n✅ Successfully added project to ${path.basename(filePath)}`);
      console.log(`📁 File path: ${filePath}`);
    } catch (error) {
      console.error(`\n❌ Failed to add project: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n🎉 Project submission processed successfully!');
}

// Run the script
processProjectSubmission().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
