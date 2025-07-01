#!/usr/bin/env node

// Explore R2 bucket using Workers local development
// This script uses the local Workers environment to access R2

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

console.log('R2 Metadata Explorer');
console.log('===================');

const command = process.argv[2] || 'help';

if (command === 'help') {
  console.log('Usage:');
  console.log('  node scripts/explore-r2-metadata.js dev     - Start dev environment to explore R2');
  console.log('  node scripts/explore-r2-metadata.js worker  - Create a temporary worker script');
  process.exit(0);
}

if (command === 'worker') {
  console.log('Creating temporary worker script...');
  
  const workerScript = `
// Temporary R2 explorer worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'list';
    const key = url.searchParams.get('key');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    try {
      if (action === 'list') {
        console.log('Listing R2 objects...');
        const objects = await env.IMAGE_BUCKET.list({ limit });
        
        const result = {
          action: 'list',
          truncated: objects.truncated,
          objects: objects.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            etag: obj.etag,
            uploaded: obj.uploaded,
            httpMetadata: obj.httpMetadata,
            customMetadata: obj.customMetadata
          }))
        };
        
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'content-type': 'application/json' }
        });
        
      } else if (action === 'get' && key) {
        console.log(\`Getting object: \${key}\`);
        const object = await env.IMAGE_BUCKET.get(key);
        
        if (!object) {
          return new Response('Object not found', { status: 404 });
        }
        
        const metadata = {
          key: key,
          size: object.size,
          etag: object.etag,
          uploaded: object.uploaded,
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata
        };
        
        // Return metadata as JSON
        return new Response(JSON.stringify(metadata, null, 2), {
          headers: { 'content-type': 'application/json' }
        });
        
      } else if (action === 'download' && key) {
        console.log(\`Downloading object: \${key}\`);
        const object = await env.IMAGE_BUCKET.get(key);
        
        if (!object) {
          return new Response('Object not found', { status: 404 });
        }
        
        return new Response(object.body, {
          headers: {
            'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
            'content-disposition': \`attachment; filename="\${key}"\`,
            'x-r2-etag': object.etag,
            'x-r2-uploaded': object.uploaded,
            'x-r2-size': object.size.toString()
          }
        });
      }
      
      return new Response('Invalid action. Use ?action=list, ?action=get&key=... or ?action=download&key=...', { 
        status: 400 
      });
      
    } catch (error) {
      console.error('R2 Error:', error);
      return new Response(\`Error: \${error.message}\`, { status: 500 });
    }
  }
};`;

  // Write temporary worker
  writeFileSync('src/temp-r2-explorer.js', workerScript);
  console.log('✅ Created src/temp-r2-explorer.js');
  console.log('');
  console.log('Now you can:');
  console.log('1. Start the dev server: wrangler dev src/temp-r2-explorer.js');
  console.log('2. Open http://localhost:8787?action=list to list objects');
  console.log('3. Get metadata: http://localhost:8787?action=get&key=OBJECT_KEY');
  console.log('4. Download: http://localhost:8787?action=download&key=OBJECT_KEY');
  console.log('');
  console.log('Remember to delete src/temp-r2-explorer.js when done!');
  
} else if (command === 'dev') {
  console.log('Starting development server...');
  console.log('First creating the worker script...');
  
  // Create the worker first
  execSync('node scripts/explore-r2-metadata.js worker', { stdio: 'inherit' });
  
  console.log('Starting wrangler dev...');
  try {
    execSync('wrangler dev src/temp-r2-explorer.js', { stdio: 'inherit' });
  } catch (error) {
    console.log('Dev server stopped');
  }
} else {
  console.log('Unknown command. Use "help" to see available commands.');
}
