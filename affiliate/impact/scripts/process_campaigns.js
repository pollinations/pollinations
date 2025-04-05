#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define paths
const dataDir = path.join(__dirname, 'get_affiliate_list', 'result');
const outputDir = path.join(__dirname, 'processed');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Get the most recent affiliate list file
const files = fs.readdirSync(dataDir)
  .filter(file => file.startsWith('get_affiliate_list_') && file.endsWith('.json'))
  .sort()
  .reverse();

if (!files.length) {
  console.error('No affiliate list files found');
  process.exit(1);
}

const mostRecentFile = files[0];
console.log(`Processing most recent file: ${mostRecentFile}`);

// Read the file
const filePath = path.join(dataDir, mostRecentFile);
const fileData = fs.readFileSync(filePath, 'utf8');
const affiliates = JSON.parse(fileData);

console.log(`Found ${affiliates.length} affiliates in the input file`);

// Group by CampaignName
const campaignGroups = {};

affiliates.forEach(affiliate => {
  // Skip entries without CampaignName
  if (!affiliate.CampaignName) {
    return;
  }
  
  const campaignName = affiliate.CampaignName;
  
  // If this is the first item for this campaign, add it
  if (!campaignGroups[campaignName]) {
    campaignGroups[campaignName] = {
      id: affiliate.Id,
      name: affiliate.Name,
      description: affiliate.Description || '',
      trackingLink: affiliate.TrackingLink,
      landingPageUrl: affiliate.LandingPageUrl,
      advertiserName: affiliate.AdvertiserName,
      affiliateCategory: affiliate.AffiliateCategory || [],
      affiliateAudience: affiliate.AffiliateAudience || '',
      affiliateProduct: affiliate.AffiliateProduct || '',
      labels: affiliate.Labels || '',
      isCustomAffiliate: affiliate.isCustomAffiliate || false
    };
  }
});

// Create the output
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const outputPath = path.join(outputDir, `campaign_first_items_${timestamp}.json`);

fs.writeFileSync(outputPath, JSON.stringify(campaignGroups, null, 2), 'utf8');

console.log(`Processed ${Object.keys(campaignGroups).length} unique campaigns`);
console.log(`Output written to: ${outputPath}`);
