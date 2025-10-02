#!/usr/bin/env node

/**
 * GitHub Star Count Updater
 * 
 * Automatically updates star counts for projects with GitHub repositories
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__dirname);

const GITHUB_API_BASE = 'https://api.github.com';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

/**
 * Extract GitHub repository info from URL
 */
function parseGitHubUrl(url) {
  if (!url) return null;
  
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/]+)/,
    /github\.com\/([^\/]+)\/([^\/]+)\.git/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, '')
      };
    }
  }
  
  return null;
}

/**
 * Fetch repository data from GitHub API
 */
async function fetchRepoData(owner, repo, githubToken) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Pollinations-Project-Updater'
  };
  
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }
  
  try {
    const response = await fetch(url, { headers });
    
    if (response.status === 404) {
      console.warn(`⚠️  Repository ${owner}/${repo} not found or private`);
      return null;
    }
    
    if (response.status === 403) {
      console.warn(`⚠️  Rate limited or access denied for ${owner}/${repo}`);
      return null;
    }
    
    if (!response.ok) {
      console.warn(`⚠️  Error fetching ${owner}/${repo}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    return {
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language,
      updatedAt: data.updated_at,
      description: data.description,
      topics: data.topics || []
    };
    
  } catch (error) {
    console.warn(`⚠️  Error fetching ${owner}/${repo}:`, error.message);
    return null;
  }
}

/**
 * Update star counts for all projects
 */
export async function updateStarCounts(githubToken = null) {
  console.log('🌟 Updating GitHub star counts...');
  
  try {
    // Load projects data
    const projectsDataPath = path.join(__dirname, '../shared/data/projects.json');
    const projectsData = JSON.parse(await fs.promises.readFile(projectsDataPath, 'utf8'));
    
    let updated = 0;
    let total = 0;
    let errors = 0;
    
    // Process each project
    for (const project of projectsData.projects) {
      if (!project.repo) continue;
      
      const repoInfo = parseGitHubUrl(project.repo);
      if (!repoInfo) {
        console.warn(`⚠️  Invalid GitHub URL: ${project.repo}`);
        continue;
      }
      
      total++;
      console.log(`🔍 Checking ${repoInfo.owner}/${repoInfo.repo}...`);
      
      const repoData = await fetchRepoData(repoInfo.owner, repoInfo.repo, githubToken);
      
      if (repoData) {
        const oldStars = project.stars || 0;
        const newStars = repoData.stars;
        
        // Update project data
        project.stars = newStars;
        project.lastUpdated = new Date().toISOString().split('T')[0];
        
        // Optionally update other metadata
        if (repoData.language && !project.techStack?.backend?.includes(repoData.language)) {
          if (!project.techStack) project.techStack = {};
          if (!project.techStack.backend) project.techStack.backend = [];
          if (!project.techStack.backend.includes(repoData.language)) {
            project.techStack.backend.push(repoData.language);
          }
        }
        
        // Add topics as tags if they don't exist
        if (repoData.topics && repoData.topics.length > 0) {
          if (!project.tags) project.tags = [];
          repoData.topics.forEach(topic => {
            if (!project.tags.includes(topic)) {
              project.tags.push(topic);
            }
          });
        }
        
        if (oldStars !== newStars) {
          const change = newStars - oldStars;
          const changeStr = change > 0 ? `+${change}` : change.toString();
          console.log(`  ✅ ${project.name}: ${oldStars} → ${newStars} (${changeStr})`);
        } else {
          console.log(`  ✅ ${project.name}: ${newStars} stars (no change)`);
        }
        
        updated++;
      } else {
        errors++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
    
    // Update metadata
    projectsData.metadata.lastUpdated = new Date().toISOString().split('T')[0];
    projectsData.metadata.statistics = {
      ...projectsData.metadata.statistics,
      lastStarUpdate: new Date().toISOString(),
      totalReposChecked: total,
      reposUpdated: updated,
      updateErrors: errors
    };
    
    // Save updated data
    await fs.promises.writeFile(
      projectsDataPath,
      JSON.stringify(projectsData, null, 2),
      'utf8'
    );
    
    console.log('\n✅ Star count update completed!');
    console.log(`📊 Statistics:`);
    console.log(`   Repositories checked: ${total}`);
    console.log(`   Successfully updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    
    return {
      success: true,
      stats: {
        total,
        updated,
        errors
      }
    };
    
  } catch (error) {
    console.error('❌ Error updating star counts:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CLI interface
 */
async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken) {
    console.warn('⚠️  No GITHUB_TOKEN provided. API rate limits will be lower.');
  }
  
  const result = await updateStarCounts(githubToken);
  
  if (!result.success) {
    console.error('Star count update failed');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { updateStarCounts, parseGitHubUrl };