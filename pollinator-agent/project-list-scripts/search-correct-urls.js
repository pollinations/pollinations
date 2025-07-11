#!/usr/bin/env node

/**
 * Script to search for correct URLs for projects with broken links
 * 
 * This script searches for projects that have broken main URLs,
 * attempts to find their GitHub repositories or correct URLs,
 * and updates the status information.
 */

import fs from 'fs/promises';
import path from 'path';

const SEARCH_DELAY = 2000; // 2 seconds between searches to be respectful

async function searchCorrectUrls() {
  try {
    const reportPath = path.join(process.cwd(), 'broken-links-report.json');
    const reportData = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    
    // Find projects with broken main URLs
    const brokenMainUrls = reportData.brokenLinks.filter(link => link.type === 'Main URL');
    
    console.log(`🔍 Found ${brokenMainUrls.length} projects with broken main URLs to investigate\n`);
    
    const results = [];
    
    for (let i = 0; i < brokenMainUrls.length; i++) {
      const project = brokenMainUrls[i];
      console.log(`[${i + 1}/${brokenMainUrls.length}] Searching for: ${project.project}`);
      console.log(`   Category: ${project.category}`);
      console.log(`   Broken URL: ${project.url}`);
      
      try {
        const searchResult = await searchForProject(project);
        results.push({
          ...project,
          searchResult
        });
        
        console.log(`   Status: ${searchResult.status}`);
        if (searchResult.correctUrl) {
          console.log(`   ✅ Found: ${searchResult.correctUrl}`);
        }
        if (searchResult.github) {
          console.log(`   📦 GitHub: ${searchResult.github}`);
        }
        console.log('');
        
      } catch (error) {
        console.log(`   ❌ Search failed: ${error.message}\n`);
        results.push({
          ...project,
          searchResult: {
            status: 'Search Failed',
            error: error.message
          }
        });
      }
      
      // Delay between searches
      if (i < brokenMainUrls.length - 1) {
        console.log(`   ⏳ Waiting ${SEARCH_DELAY/1000}s before next search...\n`);
        await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY));
      }
    }
    
    // Save updated results
    const outputPath = path.join(process.cwd(), 'url-search-results.json');
    await fs.writeFile(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalSearched: results.length,
      results
    }, null, 2));
    
    console.log(`\n✅ Search complete! Results saved to: url-search-results.json`);
    
    // Generate summary
    const found = results.filter(r => r.searchResult.correctUrl).length;
    const githubFound = results.filter(r => r.searchResult.github).length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total searched: ${results.length}`);
    console.log(`   Correct URLs found: ${found}`);
    console.log(`   GitHub repos found: ${githubFound}`);
    
    return results;
    
  } catch (error) {
    console.error(`Error in searchCorrectUrls: ${error.message}`);
    return null;
  }
}

async function searchForProject(project) {
  // We'll use a simulated search approach since we can't directly call external APIs
  // In practice, this would use the web search tool or GitHub search
  
  const projectName = project.project;
  const category = project.category;
  
  // Create search query
  const searchQuery = `${projectName} pollinations AI ${category} site:github.com`;
  
  console.log(`   🔍 Query: "${searchQuery}"`);
  
  // For now, let's return a placeholder structure
  // The actual implementation would use the web search tool
  return {
    status: 'Needs Manual Search',
    query: searchQuery,
    correctUrl: null,
    github: null,
    notes: 'Use web search tool to investigate this project'
  };
}

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Export for use with web search tool
export { searchForProject };

// Run the search if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  searchCorrectUrls().catch(console.error);
}
