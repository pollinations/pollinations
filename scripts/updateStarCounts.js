import fs from 'fs';
import path from 'path';

/**
 * Updates GitHub star counts for all projects
 * Fetches star counts from GitHub API and updates project files
 */

const GITHUB_API_BASE = 'https://api.github.com/repos';
// Use path resolution that works both locally and in CI
const PROJECT_FILES_DIR = process.env.GITHUB_ACTIONS 
  ? 'pollinations.ai/src/config/projects'  // CI environment (running from repo root)
  : '../pollinations.ai/src/config/projects'; // Local development (running from scripts dir)
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

// Helper function to extract owner/repo from GitHub URL
function extractRepoInfo(repoUrl) {
  if (!repoUrl) return null;
  
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== 'github.com') return null;
    
    const pathParts = url.pathname.split('/').filter(part => part);
    if (pathParts.length < 2) return null;
    
    return {
      owner: pathParts[0],
      repo: pathParts[1].replace(/\.git$/, '') // Remove .git suffix if present
    };
  } catch (error) {
    console.warn(`Invalid repo URL: ${repoUrl}`);
    return null;
  }
}

// Helper function to fetch star count with retry logic
async function fetchStarCount(owner, repo, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${GITHUB_API_BASE}/${owner}/${repo}`);
      
      if (response.status === 404) {
        console.warn(`Repository not found: ${owner}/${repo}`);
        return null;
      }
      
      if (response.status === 403) {
        console.warn(`Rate limited. Waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.stargazers_count;
      
    } catch (error) {
      console.warn(`Attempt ${attempt} failed for ${owner}/${repo}: ${error.message}`);
      if (attempt === retries) {
        console.error(`Failed to fetch stars for ${owner}/${repo} after ${retries} attempts`);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Helper function to read and parse project file
function readProjectFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error.message}`);
    return null;
  }
}

// Helper function to update star count in project file content
function updateStarCountInContent(content, projectName, newStarCount) {
  // Look for the project object and update the stars field
  const projectRegex = new RegExp(
    `(\\{[^}]*name:\\s*["']${projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^}]*?)(?:stars:\\s*\\d+,?\\s*)?(.*?\\})`,
    'gs'
  );
  
  return content.replace(projectRegex, (match, beforeStars, afterStars) => {
    // Remove existing stars field if present
    let cleaned = beforeStars.replace(/,?\s*stars:\s*\d+,?\s*/g, '');
    
    // Add new stars field before the closing brace
    if (newStarCount > 0) {
      // Ensure proper comma placement
      if (!cleaned.trimEnd().endsWith(',')) {
        cleaned += ',';
      }
      cleaned += `\n    stars: ${newStarCount}`;
    }
    
    return cleaned + afterStars;
  });
}

async function updateStarCounts() {
  console.log('🌟 Starting star count update...');
  
  console.log(`🔍 Environment: ${process.env.GITHUB_ACTIONS ? 'CI' : 'Local'}`);
  console.log(`📁 PROJECT_FILES_DIR: ${PROJECT_FILES_DIR}`); 
  
  const projectsDir = path.resolve(PROJECT_FILES_DIR);
  console.log(`📂 Resolved path: ${projectsDir}`);
  
  if (!fs.existsSync(projectsDir)) {
    console.log(`⚠️ Projects directory not found: ${projectsDir}`);
    console.log('🔍 Checking if parent directories exist...');
    
    // Check parent directories step by step
    const pathParts = projectsDir.split(path.sep);
    let currentPath = '';
    
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] === '') continue; // Skip empty parts (like root)
      currentPath = path.join(currentPath, pathParts[i]);
      const exists = fs.existsSync(currentPath);
      console.log(`📁 ${currentPath}: ${exists ? '✅ exists' : '❌ missing'}`);
      
      if (!exists) {
        console.log(`❌ Path breaks at: ${currentPath}`);
        break;
      }
    }
    
    // List current directory contents
    console.log('📋 Current working directory contents:');
    try {
      const cwd = process.cwd();
      console.log(`📍 CWD: ${cwd}`);
      const contents = fs.readdirSync(cwd);
      console.log('📄 Contents:', contents.slice(0, 20)); // Show first 20 items
      
      // If we're in CI and pollinations.ai directory exists, show its structure
      if (process.env.GITHUB_ACTIONS && contents.includes('pollinations.ai')) {
        console.log('🔍 pollinations.ai directory structure:');
        try {
          const pollinationsContents = fs.readdirSync('pollinations.ai');
          console.log('📄 pollinations.ai contents:', pollinationsContents);
          
          if (pollinationsContents.includes('src')) {
            const srcContents = fs.readdirSync('pollinations.ai/src');
            console.log('📄 pollinations.ai/src contents:', srcContents);
            
            if (srcContents.includes('config')) {
              const configContents = fs.readdirSync('pollinations.ai/src/config');
              console.log('📄 pollinations.ai/src/config contents:', configContents);
            }
          }
        } catch (err) {
          console.log('❌ Error reading pollinations.ai structure:', err.message);
        }
      }
    } catch (err) {
      console.log('❌ Error reading current directory:', err.message);
    }
    
    console.log('⚠️ Skipping star count update - projects directory not available');
    console.log('ℹ️ This is normal if no projects exist yet or if there is a checkout issue');
    
    // Exit with success code since this is not necessarily an error
    process.exit(0);
  }
  
  const projectFiles = fs.readdirSync(projectsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(projectsDir, file));
  
  let totalUpdated = 0;
  let totalProcessed = 0;
  
  for (const filePath of projectFiles) {
    console.log(`\n📂 Processing ${path.basename(filePath)}...`);
    
    const content = readProjectFile(filePath);
    if (!content) continue;
    
    let updatedContent = content;
    let fileUpdated = false;
    
    // Extract all projects from the file using regex
    const projectMatches = content.matchAll(/\{\s*name:\s*["']([^"']+)["'][^}]*?repo:\s*["']([^"']+)["'][^}]*?\}/gs);
    
    for (const match of projectMatches) {
      const projectName = match[1];
      const repoUrl = match[2];
      
      console.log(`  📦 ${projectName}`);
      
      const repoInfo = extractRepoInfo(repoUrl);
      if (!repoInfo) {
        console.log(`    ⚠️  Invalid repo URL format`);
        continue;
      }
      
      const starCount = await fetchStarCount(repoInfo.owner, repoInfo.repo);
      if (starCount !== null) {
        console.log(`    ⭐ ${starCount} stars`);
        updatedContent = updateStarCountInContent(updatedContent, projectName, starCount);
        fileUpdated = true;
        totalUpdated++;
      } else {
        console.log(`    ❌ Could not fetch star count`);
      }
      
      totalProcessed++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
    
    // Write back the updated content if changes were made
    if (fileUpdated) {
      try {
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        console.log(`  ✅ Updated ${path.basename(filePath)}`);
      } catch (error) {
        console.error(`  ❌ Error writing file: ${error.message}`);
      }
    } else {
      console.log(`  📝 No updates needed`);
    }
  }
  
  console.log(`\n🎉 Complete! Updated ${totalUpdated}/${totalProcessed} projects`);
}

// Run the script
updateStarCounts().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
