/**
 * Script to fetch GitHub star counts for repositories listed in the project list
 * This script is run by a GitHub Action on a daily schedule
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Config for GitHub API
const API_RATE_LIMIT_DELAY = 1000; // Delay between API requests to avoid rate limiting
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Will be provided by GitHub Actions

// File paths
const PROJECT_LIST_PATH = path.join(process.cwd(), 'pollinations.ai/src/config/projectList.js');
const OUTPUT_PATH = path.join(process.cwd(), 'pollinations.ai/src/config/github-stars.json');
const CSV_PATH = path.join(process.cwd(), 'pollinations.ai/src/config/projects.csv');

/**
 * Extract repository information from a URL
 * @param {string} url - GitHub repository URL
 * @returns {Object|null} Object containing owner and repo or null if not a valid GitHub URL
 */
function extractRepoInfo(url) {
  if (!url) return null;
  
  // Handle both full URLs and shorthand URLs
  const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
  const match = url.match(githubRegex);
  
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '') // Remove .git extension if present
    };
  }
  
  return null;
}

/**
 * Fetch star count for a GitHub repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<number>} Number of stars
 */
function getRepoStars(owner, repo) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Pollinations-GitHub-Star-Counter',
        ...(GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {})
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`✅ Fetched stars for ${owner}/${repo}: ${jsonData.stargazers_count}`);
            resolve(jsonData.stargazers_count || 0);
          } catch (e) {
            console.error(`❌ Error parsing response for ${owner}/${repo}:`, e.message);
            resolve(0);
          }
        } else {
          console.error(`❌ Failed to fetch stars for ${owner}/${repo}: ${res.statusCode}`);
          console.error(`Response: ${data}`);
          resolve(0);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error(`❌ Request error for ${owner}/${repo}:`, e.message);
      resolve(0);
    });
    
    req.end();
  });
}

/**
 * Parse project entries from projectList.js and extract GitHub repository URLs
 * @returns {Array} Array of repo objects with category, name, url, and repo properties
 */
async function parseProjectList() {
  try {
    // Read the projectList.js file
    const projectListContent = fs.readFileSync(PROJECT_LIST_PATH, 'utf8');
    
    // Extract all URLs that might be GitHub repos using regex
    // This avoids having to actually execute the JavaScript to get the data
    const allUrls = [];
    const categoryRegex = /(\w+):\s*\[\s*(?:\{[^}]*\},?\s*)*\]/gs;
    const categoryMatches = projectListContent.matchAll(categoryRegex);
    
    for (const categoryMatch of categoryMatches) {
      const category = categoryMatch[1];
      const entriesContent = categoryMatch[0];
      
      // Extract each project entry
      const entryRegex = /\{\s*name:\s*["']([^"']+)["'],\s*(?:url:\s*["']([^"']+)["'],\s*)?(?:description:[^,]*,\s*)?(?:author:[^,]*,\s*)?(?:repo:\s*["']([^"']+)["'],\s*)?[^}]*\}/gs;
      const entryMatches = entriesContent.matchAll(entryRegex);
      
      for (const entryMatch of entryMatches) {
        const name = entryMatch[1];
        const url = entryMatch[2] || '';
        const repoUrl = entryMatch[3] || '';
        
        // Add URL if it's a GitHub URL
        if (url.includes('github.com')) {
          allUrls.push({ category, name, url, repo: url });
        }
        
        // Add repo if it's specified
        if (repoUrl) {
          allUrls.push({ category, name, url, repo: repoUrl });
        }
      }
    }
    
    // Parse CSV for additional repo URLs
    if (fs.existsSync(CSV_PATH)) {
      const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
      const lines = csvContent.split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Split the CSV line, being careful with commas inside quotes
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (parts.length >= 8) {
          const category = parts[0];
          const name = parts[1];
          const url = parts[2];
          const repo = parts[7];
          
          if (repo && repo.includes('github.com')) {
            allUrls.push({ category, name, url, repo });
          }
        }
      }
    }
    
    return allUrls;
  } catch (error) {
    console.error('Error parsing project list:', error);
    return [];
  }
}

/**
 * Main function that orchestrates the fetching of GitHub stars
 */
async function main() {
  try {
    // Parse project list and extract GitHub repository URLs
    const repos = await parseProjectList();
    console.log(`Found ${repos.length} potential GitHub repositories`);
    
    // Fetch star counts
    const starData = {};
    let processedRepos = 0;
    
    for (const { category, name, repo } of repos) {
      const repoInfo = extractRepoInfo(repo);
      if (repoInfo) {
        const { owner, repo: repoName } = repoInfo;
        const key = `${owner}/${repoName}`;
        
        // Skip if we've already processed this repo
        if (starData[key]) continue;
        
        // Fetch star count
        const stars = await getRepoStars(owner, repoName);
        starData[key] = { stars, owner, repo: repoName };
        
        // Add a delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT_DELAY));
        processedRepos++;
      }
    }
    
    console.log(`Successfully fetched stars for ${processedRepos} repositories`);
    
    // Save results to a JSON file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(starData, null, 2));
    console.log(`Star data saved to ${OUTPUT_PATH}`);
    
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the main function
main();
