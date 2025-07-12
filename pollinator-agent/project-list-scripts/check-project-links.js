#!/usr/bin/env node

/**
 * Script to check for broken links in the projects list
 * 
 * This script reads project data from pollinations.ai/src/config/projectList.js
 * and checks each URL (both project URLs and GitHub repos) to identify:
 * - 404 errors
 * - Connection timeouts
 * - Other HTTP errors
 * - Redirects that might indicate moved content
 * 
 * Usage:
 *   node check-project-links.js [--verbose] [--timeout=5000] [--category=chat]
 */

import { projects } from '../../pollinations.ai/src/config/projectList.js';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const USER_AGENT = 'Mozilla/5.0 (compatible; Pollinations-LinkChecker/1.0)';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const timeoutArg = args.find(arg => arg.startsWith('--timeout='));
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : DEFAULT_TIMEOUT;
const categoryArg = args.find(arg => arg.startsWith('--category='));
const filterCategory = categoryArg ? categoryArg.split('=')[1] : null;

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Function to check a single URL
async function checkUrl(url, context = '') {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD to avoid downloading full content
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*'
      },
      redirect: 'manual' // Don't follow redirects automatically
    });

    clearTimeout(timeoutId);

    const result = {
      url,
      context,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirected: false,
      finalUrl: url,
      error: null
    };

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        result.redirected = true;
        result.finalUrl = location;
        
        // For some redirects, we might want to check the final destination
        if (response.status === 301 || response.status === 302) {
          try {
            const finalResponse = await fetch(location, {
              method: 'HEAD',
              signal: controller.signal,
              headers: {
                'User-Agent': USER_AGENT,
                'Accept': '*/*'
              }
            });
            result.finalStatus = finalResponse.status;
            result.finalOk = finalResponse.ok;
          } catch (e) {
            result.finalError = e.message;
          }
        }
      }
    }

    return result;

  } catch (error) {
    return {
      url,
      context,
      status: null,
      statusText: null,
      ok: false,
      redirected: false,
      finalUrl: url,
      error: error.name === 'AbortError' ? 'Timeout' : error.message
    };
  }
}

// Function to categorize and format results
function categorizeResult(result) {
  if (result.error) {
    if (result.error === 'Timeout') {
      return { category: 'timeout', severity: 'warning' };
    }
    return { category: 'error', severity: 'error' };
  }

  if (result.status === 404) {
    return { category: 'not_found', severity: 'error' };
  }

  if (result.status >= 400) {
    return { category: 'client_error', severity: 'error' };
  }

  if (result.status >= 500) {
    return { category: 'server_error', severity: 'warning' };
  }

  if (result.redirected) {
    // Check if redirect is to a different domain
    try {
      const originalDomain = new URL(result.url).hostname;
      const finalDomain = new URL(result.finalUrl).hostname;
      if (originalDomain !== finalDomain) {
        return { category: 'redirect_external', severity: 'info' };
      }
      return { category: 'redirect_internal', severity: 'info' };
    } catch (e) {
      return { category: 'redirect_unknown', severity: 'warning' };
    }
  }

  if (result.ok) {
    return { category: 'ok', severity: 'success' };
  }

  return { category: 'unknown', severity: 'warning' };
}

// Function to format result for display
function formatResult(result, category) {
  const { severity } = category;
  const color = severity === 'error' ? colors.red : 
                severity === 'warning' ? colors.yellow :
                severity === 'info' ? colors.cyan : colors.green;

  let status = '';
  if (result.error) {
    status = `${colors.red}ERROR: ${result.error}${colors.reset}`;
  } else if (result.redirected) {
    status = `${colors.yellow}${result.status} → ${result.finalUrl}${colors.reset}`;
    if (result.finalStatus) {
      status += ` (${result.finalOk ? colors.green : colors.red}${result.finalStatus}${colors.reset})`;
    }
  } else {
    status = `${color}${result.status} ${result.statusText}${colors.reset}`;
  }

  return `${color}●${colors.reset} ${result.url} - ${status}`;
}

// Main function to check all project links
async function checkAllLinks() {
  console.log(`${colors.bold}🔗 Checking project links...${colors.reset}\n`);
  
  if (filterCategory) {
    console.log(`${colors.blue}Filtering by category: ${filterCategory}${colors.reset}\n`);
  }

  const results = {
    ok: [],
    not_found: [],
    client_error: [],
    server_error: [],
    timeout: [],
    error: [],
    redirect_internal: [],
    redirect_external: [],
    redirect_unknown: [],
    unknown: []
  };

  let totalChecked = 0;
  let totalUrls = 0;

  // Collect all URLs to check
  const urlsToCheck = [];
  
  for (const [categoryKey, categoryProjects] of Object.entries(projects)) {
    if (filterCategory && categoryKey !== filterCategory) {
      continue;
    }

    for (const project of categoryProjects) {
      // Check project URL
      if (project.url) {
        urlsToCheck.push({
          url: project.url,
          context: `${categoryKey}/${project.name} (main URL)`,
          project: project.name,
          category: categoryKey
        });
        totalUrls++;
      }

      // Check GitHub repo URL
      if (project.repo && project.repo !== project.url) {
        urlsToCheck.push({
          url: project.repo,
          context: `${categoryKey}/${project.name} (repo)`,
          project: project.name,
          category: categoryKey
        });
        totalUrls++;
      }
    }
  }

  console.log(`${colors.blue}Found ${totalUrls} URLs to check${colors.reset}\n`);

  // Check URLs with progress indication
  for (let i = 0; i < urlsToCheck.length; i++) {
    const { url, context } = urlsToCheck[i];
    
    if (verbose) {
      console.log(`[${i + 1}/${urlsToCheck.length}] Checking: ${url}`);
    } else {
      // Show progress without verbose output
      process.stdout.write(`\rProgress: ${i + 1}/${urlsToCheck.length} (${Math.round((i + 1) / urlsToCheck.length * 100)}%)`);
    }

    const result = await checkUrl(url, context);
    const category = categorizeResult(result);
    
    results[category.category].push({ ...result, ...urlsToCheck[i] });
    totalChecked++;

    if (verbose) {
      console.log(`  ${formatResult(result, category)}\n`);
    }

    // Small delay to be respectful to servers
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!verbose) {
    console.log('\n'); // New line after progress
  }

  // Display summary
  console.log(`${colors.bold}📊 Summary${colors.reset}`);
  console.log(`Total URLs checked: ${totalChecked}`);
  console.log(`Timeout: ${timeout}ms\n`);

  // Display results by category
  const categoryOrder = ['not_found', 'client_error', 'server_error', 'error', 'timeout', 'redirect_external', 'redirect_internal', 'redirect_unknown', 'unknown', 'ok'];
  
  for (const cat of categoryOrder) {
    const items = results[cat];
    if (items.length === 0) continue;

    const color = cat === 'not_found' || cat === 'client_error' || cat === 'server_error' || cat === 'error' ? colors.red :
                  cat === 'timeout' || cat === 'unknown' ? colors.yellow :
                  cat.startsWith('redirect') ? colors.cyan : colors.green;

    console.log(`${color}${colors.bold}${getCategoryTitle(cat)} (${items.length})${colors.reset}`);
    
    for (const item of items) {
      const category = categorizeResult(item);
      console.log(`  ${formatResult(item, category)}`);
      console.log(`    ${colors.blue}Project: ${item.project} (${item.category})${colors.reset}`);
    }
    console.log('');
  }

  // Generate broken links report
  const brokenLinks = [
    ...results.not_found,
    ...results.client_error,
    ...results.server_error,
    ...results.error,
    ...results.timeout
  ];

  if (brokenLinks.length > 0) {
    console.log(`${colors.red}${colors.bold}🚨 Broken Links Report${colors.reset}`);
    console.log(`Found ${brokenLinks.length} broken links:\n`);

    const reportData = brokenLinks.map(item => ({
      project: item.project,
      category: item.category,
      url: item.url,
      type: item.context.includes('repo') ? 'Repository' : 'Main URL',
      status: item.status || 'Error',
      error: item.error || item.statusText || 'Unknown error'
    }));

    // Group by project for easier fixing
    const byProject = {};
    for (const item of reportData) {
      if (!byProject[item.project]) {
        byProject[item.project] = [];
      }
      byProject[item.project].push(item);
    }

    for (const [projectName, issues] of Object.entries(byProject)) {
      console.log(`${colors.red}● ${projectName}${colors.reset}`);
      for (const issue of issues) {
        console.log(`  ${issue.type}: ${issue.url}`);
        console.log(`  Status: ${issue.status} - ${issue.error}`);
        console.log(`  Category: ${issue.category}`);
      }
      console.log('');
    }

    // Save broken links to file
    const reportFile = path.join(process.cwd(), 'broken-links-report.json');
    await fs.writeFile(reportFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalChecked,
      brokenCount: brokenLinks.length,
      brokenLinks: reportData
    }, null, 2));

    console.log(`${colors.yellow}📄 Detailed report saved to: ${reportFile}${colors.reset}\n`);
  } else {
    console.log(`${colors.green}${colors.bold}✅ All links are working!${colors.reset}\n`);
  }

  return results;
}

function getCategoryTitle(category) {
  const titles = {
    ok: '✅ Working Links',
    not_found: '❌ Not Found (404)',
    client_error: '❌ Client Errors (4xx)',
    server_error: '⚠️  Server Errors (5xx)',
    timeout: '⏱️  Timeouts',
    error: '💥 Connection Errors',
    redirect_internal: '🔄 Internal Redirects',
    redirect_external: '🔗 External Redirects',
    redirect_unknown: '❓ Unknown Redirects',
    unknown: '❓ Unknown Status'
  };
  return titles[category] || category;
}

// Show help
function showHelp() {
  console.log(`${colors.bold}🔗 Project Link Checker${colors.reset}

Usage: node check-project-links.js [options]

Options:
  --verbose           Show detailed output for each URL check
  --timeout=<ms>      Set timeout in milliseconds (default: ${DEFAULT_TIMEOUT})
  --category=<name>   Check only specific category (e.g., chat, creative, games)
  --help              Show this help message

Examples:
  node check-project-links.js
  node check-project-links.js --verbose
  node check-project-links.js --timeout=5000 --category=chat
  node check-project-links.js --verbose --category=creative

Categories available: ${Object.keys(projects).join(', ')}
`);
}

// Main execution
if (args.includes('--help')) {
  showHelp();
} else {
  checkAllLinks().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}
