#!/usr/bin/env node

// Simple R2 downloader using the temporary production worker
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const WORKER_URL = 'https://temp-r2-explorer.thomash-efd.workers.dev';

async function listObjects(limit = 10, prefix = '') {
  const url = `${WORKER_URL}?action=list&limit=${limit}${prefix ? `&prefix=${prefix}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to list: ${response.status}`);
  return response.json();
}

async function searchObjects(query, maxResults = 20) {
  const url = `${WORKER_URL}?action=search&query=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to search: ${response.status}`);
  return response.json();
}

async function getMetadata(key) {
  const url = `${WORKER_URL}?action=metadata&key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to get metadata: ${response.status}`);
  return response.json();
}

async function downloadImage(key, filename) {
  const url = `${WORKER_URL}?action=download&key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  
  const buffer = await response.arrayBuffer();
  
  // Create downloads directory
  if (!existsSync('downloads')) {
    mkdirSync('downloads', { recursive: true });
  }
  
  // Save file
  const filepath = join('downloads', filename);
  writeFileSync(filepath, Buffer.from(buffer));
  
  // Save metadata
  const headers = Object.fromEntries(response.headers.entries());
  const metadataPath = join('downloads', `${filename}.metadata.json`);
  writeFileSync(metadataPath, JSON.stringify({
    key: key,
    filename: filename,
    downloadedAt: new Date().toISOString(),
    headers: headers
  }, null, 2));
  
  return { filepath, metadataPath };
}

// Main CLI
const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'list':
      const limit = parseInt(args[0]) || 10;
      console.log(`Listing ${limit} objects...`);
      const list = await listObjects(limit);
      
      console.log(`Found ${list.total} objects (truncated: ${list.truncated})`);
      list.objects.forEach((obj, i) => {
        console.log(`${i + 1}. ${decodeURIComponent(obj.key)}`);
        console.log(`   Size: ${(obj.size / 1024).toFixed(1)} KB`);
        console.log(`   Uploaded: ${obj.uploaded}`);
        console.log('');
      });
      break;
      
    case 'search':
      const query = args[0];
      if (!query) {
        console.log('Usage: node simple-r2-downloader.js search <query> [maxResults]');
        process.exit(1);
      }
      const maxResults = parseInt(args[1]) || 20;
      console.log(`Searching for "${query}"...`);
      
      const searchResult = await searchObjects(query, maxResults);
      console.log(`Found ${searchResult.totalMatches} matches (fetched ${searchResult.totalFetched} total)`);
      
      searchResult.objects.forEach((obj, i) => {
        console.log(`${i + 1}. ${decodeURIComponent(obj.key)}`);
        console.log(`   Size: ${(obj.size / 1024).toFixed(1)} KB`);
        console.log(`   Uploaded: ${obj.uploaded}`);
        if (obj.originalUrl) console.log(`   Original URL: ${obj.originalUrl}`);
        console.log('');
      });
      break;
      
    case 'download':
      const key = args[0];
      const filename = args[1] || `image_${Date.now()}.jpg`;
      
      if (!key) {
        console.log('Usage: node simple-r2-downloader.js download <key> [filename]');
        process.exit(1);
      }
      
      console.log(`Downloading: ${decodeURIComponent(key)}`);
      const { filepath, metadataPath } = await downloadImage(key, filename);
      console.log(`✅ Saved to: ${filepath}`);
      console.log(`📋 Metadata: ${metadataPath}`);
      break;
      
    case 'metadata':
      const metaKey = args[0];
      if (!metaKey) {
        console.log('Usage: node simple-r2-downloader.js metadata <key>');
        process.exit(1);
      }
      
      console.log(`Getting metadata for: ${decodeURIComponent(metaKey)}`);
      const metadata = await getMetadata(metaKey);
      console.log(JSON.stringify(metadata, null, 2));
      break;
      
    default:
      console.log('R2 Image Downloader');
      console.log('==================');
      console.log('');
      console.log('Commands:');
      console.log('  list [limit]                 - List objects (default: 10)');
      console.log('  search <query> [maxResults]  - Search objects (default: 20)');
      console.log('  download <key> [filename]    - Download an object');
      console.log('  metadata <key>               - Get object metadata');
      console.log('');
      console.log('Examples:');
      console.log('  node simple-r2-downloader.js list 5');
      console.log('  node simple-r2-downloader.js search "cat" 10');
      console.log('  node simple-r2-downloader.js download "%2Fprompt%2F..." cat.jpg');
      break;
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
