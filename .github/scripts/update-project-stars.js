#!/usr/bin/env node

/**
 * Script to fetch GitHub star counts and update the project list file
 *
 * This script can be used in two ways:
 *
 * 1. Without arguments: Updates the project list file with star counts
 *    - Reads the project list file
 *    - Finds all GitHub repository URLs
 *    - Fetches star counts for repositories that don't already have them
 *    - Updates the file with the star counts
 *
 * 2. With owner/repo argument: Fetches and outputs star count for a specific repository
 *    - Fetches the star count for the specified repository
 *    - Outputs the star count in various formats (plain, formatted, markdown)
 *
 * Usage:
 *   - Update project list: node update-project-stars.js
 *   - Get stars for repo: node update-project-stars.js owner/repo
 *
 * Example: node update-project-stars.js pollinations/pollinations
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Path to the project list file (relative to the repository root)
const PROJECT_LIST_PATH = path.join('pollinations.ai', 'src', 'config', 'projectList.js');

// Function to extract owner and repo from GitHub URL
function extractOwnerAndRepo(url) {
  // Handle different GitHub URL formats
  const githubRegex = /github\.com\/([^\/]+)\/([^\/\s]+)/;
  const match = url.match(githubRegex);

  if (match && match.length >= 3) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '') // Remove .git if present
    };
  }

  return null;
}

// Function to fetch star count from GitHub API
function fetchStarCount(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'GitHub-Star-Counter',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.stargazers_count !== undefined) {
            resolve({
              stars: response.stargazers_count,
              fullResponse: response
            });
          } else if (response.message) {
            reject(new Error(`GitHub API error: ${response.message}`));
          } else {
            reject(new Error('Failed to get star count'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
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

// Function to fetch and display stars for a specific repository
async function fetchAndDisplayStars(ownerRepo) {
  try {
    const [owner, repo] = ownerRepo.split('/');

    if (!owner || !repo) {
      console.error('Invalid repository format. Please use "owner/repo"');
      console.error('Example: node update-project-stars.js pollinations/pollinations');
      process.exit(1);
    }

    console.log(`Fetching star count for ${owner}/${repo}...`);
    const result = await fetchStarCount(owner, repo);
    const stars = result.stars;

    console.log('\nResults:');
    console.log('-------------------------------------');
    console.log(`Repository:    ${owner}/${repo}`);
    console.log(`Stars:         ${stars}`);
    console.log(`Formatted:     ⭐ ${formatStarCount(stars)}`);
    console.log(`Markdown:      [${owner}/${repo}](https://github.com/${owner}/${repo}) - ⭐ ${formatStarCount(stars)}`);
    console.log('-------------------------------------');

    // Output just the number for easy parsing
    console.log('\nStar count (raw number):');
    console.log(stars);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Function to process the project list file
async function processProjectList() {
  try {
    // Read the file
    const fileContent = fs.readFileSync(PROJECT_LIST_PATH, 'utf8');

    // Find all repo URLs
    const repoRegex = /repo:\s*"(https:\/\/github\.com\/[^"]+)"/g;
    let match;
    let updatedContent = fileContent;
    let updates = 0;
    let skipped = 0;

    // Process each repo URL
    const promises = [];
    const repoMatches = [];

    while ((match = repoRegex.exec(fileContent)) !== null) {
      const repoUrl = match[1];

      // Check if this project already has a stars field
      const nextLines = fileContent.substring(match.index, match.index + 200);
      if (nextLines.includes('stars:')) {
        console.log(`Skipping ${repoUrl} - already has stars count`);
        skipped++;
        continue;
      }

      const ownerRepo = extractOwnerAndRepo(repoUrl);
      if (ownerRepo) {
        repoMatches.push({
          url: repoUrl,
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          position: match.index + match[0].length
        });

        promises.push(fetchStarCount(ownerRepo.owner, ownerRepo.repo));
      }
    }

    // Wait for all API calls to complete
    const results = await Promise.allSettled(promises);

    // Apply updates in reverse order to maintain correct positions
    for (let i = repoMatches.length - 1; i >= 0; i--) {
      const result = results[i];
      const repoMatch = repoMatches[i];

      if (result.status === 'fulfilled') {
        const starCount = result.value.stars;
        console.log(`${repoMatch.owner}/${repoMatch.repo}: ${starCount} stars`);

        // Insert the stars field after the repo field
        const insertPosition = repoMatch.position;
        const beforeInsert = updatedContent.substring(0, insertPosition);
        const afterInsert = updatedContent.substring(insertPosition);

        updatedContent = beforeInsert + `,\n      stars: ${starCount}` + afterInsert;
        updates++;
      } else {
        console.error(`Failed to fetch stars for ${repoMatch.owner}/${repoMatch.repo}: ${result.reason}`);
      }
    }

    // Write the updated content back to the file
    if (updates > 0) {
      fs.writeFileSync(PROJECT_LIST_PATH, updatedContent, 'utf8');
      console.log(`Updated ${updates} repositories with star counts`);
    } else {
      console.log('No updates needed');
    }

    console.log(`Summary: ${updates} updated, ${skipped} skipped`);

  } catch (error) {
    console.error('Error processing file:', error);
    process.exit(1);
  }
}

// Main function
async function main() {
  // Check if a repository is provided as an argument
  if (process.argv.length > 2) {
    // If an argument is provided, fetch and display stars for that repository
    await fetchAndDisplayStars(process.argv[2]);
  } else {
    // Otherwise, process the project list file
    await processProjectList();
  }
}

// Run the script
main();
