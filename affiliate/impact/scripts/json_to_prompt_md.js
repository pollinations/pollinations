#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define paths
const processedDir = path.join(__dirname, 'processed');
const outputDir = path.join(__dirname, 'prompts');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Get the most recent campaign data file
const files = fs.readdirSync(processedDir)
  .filter(file => file.startsWith('campaign_first_items_') && file.endsWith('.json'))
  .sort()
  .reverse();

if (!files.length) {
  console.error('No campaign data files found');
  process.exit(1);
}

const mostRecentFile = files[0];
console.log(`Processing file: ${mostRecentFile}`);

// Read the file
const filePath = path.join(processedDir, mostRecentFile);
const fileData = fs.readFileSync(filePath, 'utf8');
const campaignData = JSON.parse(fileData);

// Create markdown content
let markdown = `# Affiliate Campaign Mapping for Content Matching\n\n`;
markdown += `Use this information to determine which affiliate campaign is most relevant to the conversation. `;
markdown += `For each campaign, consider the product type, target audience, and category to find the best match.\n\n`;

// Add campaigns to markdown
for (const [campaignName, campaign] of Object.entries(campaignData)) {
  // Skip campaigns without meaningful data
  if (!campaign.affiliateProduct && !campaign.description && !campaign.name) {
    continue;
  }
  
  markdown += `## ${campaignName}\n\n`;
  
  // Add ID for reference
  markdown += `- **ID**: \`${campaign.id}\`\n`;
  
  // Add product info if available
  if (campaign.affiliateProduct) {
    markdown += `- **Product**: ${campaign.affiliateProduct}\n`;
  } else if (campaign.name) {
    markdown += `- **Name**: ${campaign.name}\n`;
  }
  
  // Add description if available and not redundant with product name
  if (campaign.description && 
      campaign.description !== campaign.name && 
      campaign.description !== campaign.affiliateProduct) {
    markdown += `- **Description**: ${campaign.description}\n`;
  }
  
  // Add audience info
  if (campaign.affiliateAudience) {
    markdown += `- **Audience**: ${campaign.affiliateAudience}\n`;
  }
  
  // Add categories as tags for easier matching
  if (campaign.affiliateCategory && campaign.affiliateCategory.length > 0) {
    markdown += `- **Categories**: ${campaign.affiliateCategory.join(', ')}\n`;
  }
  
  // Add custom tags/labels if available
  if (campaign.labels && campaign.labels.length > 0) {
    markdown += `- **Tags**: ${campaign.labels}\n`;
  }
  
  // Add NSFW flag if relevant
  if (campaign.affiliateCategory?.includes('Sexual Wellness & Adult') || 
      campaign.labels?.includes('nsfw') || 
      campaign.labels?.includes('adult')) {
    markdown += `- **NSFW**: Yes\n`;
  }
  
  markdown += '\n';
}

// Add a section with recommendations for matching
markdown += `## Matching Guidelines\n\n`;
markdown += `1. Match based on relevance to the conversation topic.\n`;
markdown += `2. Only suggest NSFW campaigns for explicitly adult conversations.\n`;
markdown += `3. For general conversations about tech, suggest software or apps.\n`;
markdown += `4. If no clear match exists, default to suggesting the Ko-fi donation.\n`;
markdown += `5. Don't force a match - it's better to suggest nothing than an irrelevant product.\n`;

// Create the output file
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const outputPath = path.join(outputDir, `affiliate_prompt_${timestamp}.md`);

fs.writeFileSync(outputPath, markdown, 'utf8');

console.log(`Markdown prompt created at: ${outputPath}`);
