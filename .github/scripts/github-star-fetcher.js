#!/usr/bin/env node

/**
 * Simple script to fetch GitHub star count for a repository
 * Usage: node github-star-fetcher.js owner/repo
 * Example: node github-star-fetcher.js pollinations/pollinations
 */

const https = require('https');

// Check if a repository is provided
if (process.argv.length < 3) {
  console.error('Please provide a repository in the format "owner/repo"');
  console.error('Example: node github-star-fetcher.js pollinations/pollinations');
  process.exit(1);
}

// Get repository from command line argument
const repoPath = process.argv[2];
const [owner, repo] = repoPath.split('/');

if (!owner || !repo) {
  console.error('Invalid repository format. Please use "owner/repo"');
  console.error('Example: node github-star-fetcher.js pollinations/pollinations');
  process.exit(1);
}

// Function to fetch star count
function fetchGitHubStars(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Simple-GitHub-Star-Fetcher'
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
            resolve(jsonData.stargazers_count || 0);
          } catch (e) {
            reject(new Error(`Error parsing response: ${e.message}`));
          }
        } else {
          reject(new Error(`Failed to fetch stars (Status ${res.statusCode}): ${data}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });
    
    req.end();
  });
}

// Format star count for display
function formatStarCount(stars) {
  if (stars < 1000) {
    return stars.toString();
  } else {
    return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
}

// Main function
async function main() {
  try {
    console.log(`Fetching star count for ${owner}/${repo}...`);
    const stars = await fetchGitHubStars(owner, repo);
    
    console.log('\nResults:');
    console.log('-------------------------------------');
    console.log(`Repository:    ${owner}/${repo}`);
    console.log(`Stars:         ${stars}`);
    console.log(`Formatted:     ⭐ ${formatStarCount(stars)}`);
    console.log(`Markdown:      [${owner}/${repo}](https://github.com/${owner}/${repo}) - ⭐ ${formatStarCount(stars)}`);
    console.log('-------------------------------------');
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
