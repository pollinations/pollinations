#!/usr/bin/env node

// Minimal R2 bucket explorer/downloader
// Usage: CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_AUTH_TOKEN=xxx node scripts/download-r2-images.js [list|download]

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;
const BUCKET_NAME = 'pollinations-images';
const BASE_URL = 'https://api.cloudflare.com/client/v4';

if (!ACCOUNT_ID || !AUTH_TOKEN) {
  console.error('Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN environment variables required');
  console.error('Usage: CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_AUTH_TOKEN=xxx node scripts/download-r2-images.js [list|download]');
  process.exit(1);
}

async function listObjects(limit = 10) {
  // Use S3-compatible API
  const url = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}?list-type=2&max-keys=${limit}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  console.log('Raw response:', text);
  
  // Parse XML response (simple parsing for now)
  const objects = [];
  const keyMatches = text.match(/<Key>(.*?)<\/Key>/g) || [];
  const sizeMatches = text.match(/<Size>(.*?)<\/Size>/g) || [];
  const modifiedMatches = text.match(/<LastModified>(.*?)<\/LastModified>/g) || [];
  
  for (let i = 0; i < keyMatches.length; i++) {
    objects.push({
      key: keyMatches[i].replace(/<\/?Key>/g, ''),
      size: parseInt(sizeMatches[i]?.replace(/<\/?Size>/g, '') || '0'),
      lastModified: modifiedMatches[i]?.replace(/<\/?LastModified>/g, '') || ''
    });
  }
  
  return objects;
}

async function downloadObject(key) {
  const url = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${encodeURIComponent(key)}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Download error: ${response.status}`);
  }

  return response.arrayBuffer();
}

// Main
const command = process.argv[2] || 'list';

try {
  if (command === 'list') {
    console.log('Listing R2 objects...\n');
    const objects = await listObjects();
    
    objects.forEach((obj, i) => {
      console.log(`${i + 1}. ${obj.key}`);
      console.log(`   Size: ${obj.size} bytes`);
      console.log(`   Modified: ${obj.lastModified}`);
      console.log('');
    });
    
    console.log(`Total objects: ${objects.length || 0}`);
    
  } else if (command === 'download') {
    const key = process.argv[3];
    if (!key) {
      console.log('Usage: node download-r2-images.js download <object-key>');
      process.exit(1);
    }
    
    console.log(`Downloading: ${key}`);
    const data = await downloadObject(key);
    
    // Create downloads directory
    mkdirSync('downloads', { recursive: true });
    
    // Save file
    const filename = key.replace(/[^a-zA-Z0-9._-]/g, '_') + '.jpg';
    const filepath = join('downloads', filename);
    writeFileSync(filepath, Buffer.from(data));
    
    console.log(`Saved to: ${filepath}`);
  } else {
    console.log('Usage: node download-r2-images.js [list|download <key>]');
  }
  
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
