// Production R2 Explorer - Deploy temporarily to access production R2
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'list';
    const key = url.searchParams.get('key');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const prefix = url.searchParams.get('prefix') || '';
    
    // Add CORS headers for browser access
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      if (action === 'list') {
        const cursor = url.searchParams.get('cursor');
        const reverse = url.searchParams.get('reverse') === 'true';
        
        console.log(`Listing R2 objects... limit: ${limit}, prefix: "${prefix}", cursor: ${cursor ? 'YES' : 'NO'}, reverse: ${reverse}`);
        
        const listOptions = { limit };
        if (prefix) listOptions.prefix = prefix;
        if (cursor) listOptions.cursor = cursor;
        
        const objects = await env.IMAGE_BUCKET.list(listOptions);
        
        const result = {
          action: 'list',
          truncated: objects.truncated,
          cursor: objects.cursor,
          delimitedPrefixes: objects.delimitedPrefixes,
          objects: objects.objects
        };
        
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 
            'content-type': 'application/json',
            ...corsHeaders
          }
        });
        
      } else if (action === 'skip') {
        const skipCount = parseInt(url.searchParams.get('skipCount') || '1000');
        console.log(`Skipping ${skipCount} objects to find newer ones...`);
        
        let cursor = undefined;
        let skipped = 0;
        
        // Skip ahead by fetching and discarding objects
        while (skipped < skipCount) {
          const batchSize = Math.min(1000, skipCount - skipped);
          const objects = await env.IMAGE_BUCKET.list({ 
            limit: batchSize, 
            cursor 
          });
          
          if (objects.objects.length === 0 || !objects.truncated) {
            break; // Reached end of bucket
          }
          
          cursor = objects.cursor;
          skipped += objects.objects.length;
        }
        
        // Now get the actual objects we want to see
        const finalObjects = await env.IMAGE_BUCKET.list({ 
          limit, 
          cursor 
        });
        
        const result = {
          action: 'skip',
          skipped: skipped,
          cursor: cursor,
          objects: finalObjects.objects
        };
        
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 
            'content-type': 'application/json',
            ...corsHeaders
          }
        });
        
      } else if (action === 'jump') {
        // Try different prefixes based on actual cache key generation
        // Current pattern: path with / replaced by _ + query params + hash
        const prefixes = [
          '_prompt_',  // Most likely current format: /prompt/ -> _prompt_
          'prompt_',   // Alternative format
          '_model_',   // For model-specific caches
          '_seed_',    // For seed-based caches
          '_width_',   // For size-based caches
          '_height_',  // For size-based caches
          'http',      // Legacy format with full URLs
          'https'      // Legacy format with full URLs
        ];
        
        const results = [];
        for (const prefix of prefixes) {
          try {
            const objects = await env.IMAGE_BUCKET.list({ 
              limit: 5,
              prefix: prefix
            });
            
            if (objects.objects.length > 0) {
              results.push({
                prefix: prefix,
                count: objects.objects.length,
                truncated: objects.truncated,
                objects: objects.objects
              });
            }
          } catch (e) {
            // Skip failed prefixes
          }
        }
        
        return new Response(JSON.stringify({
          action: 'jump',
          results: results
        }, null, 2), {
          headers: { 
            'content-type': 'application/json',
            ...corsHeaders
          }
        });
        
      } else if (action === 'metadata' && key) {
        console.log(`Getting metadata for: ${key}`);
        const object = await env.IMAGE_BUCKET.head(key);
        
        if (!object) {
          return new Response('Object not found', { 
            status: 404,
            headers: corsHeaders
          });
        }
        
        const metadata = {
          key: key,
          size: object.size,
          etag: object.etag,
          uploaded: object.uploaded.toISOString(),
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata
        };
        
        return new Response(JSON.stringify(metadata, null, 2), {
          headers: { 
            'content-type': 'application/json',
            ...corsHeaders
          }
        });
        
      } else if (action === 'download' && key) {
        console.log(`Downloading object: ${key}`);
        const object = await env.IMAGE_BUCKET.get(key);
        
        if (!object) {
          return new Response('Object not found', { 
            status: 404,
            headers: corsHeaders
          });
        }
        
        // Get file extension from content type or key
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
        const extension = getFileExtension(contentType);
        const filename = key.includes('.') ? key : `${key}${extension}`;
        
        return new Response(object.body, {
          headers: {
            'content-type': contentType,
            'content-disposition': `attachment; filename="${filename}"`,
            'x-r2-etag': object.etag,
            'x-r2-uploaded': object.uploaded.toISOString(),
            'x-r2-size': object.size.toString(),
            'x-r2-key': key,
            ...corsHeaders
          }
        });
        
      } else if (action === 'search') {
        const query = url.searchParams.get('query') || '';
        const maxResults = parseInt(url.searchParams.get('maxResults') || '50');
        
        console.log(`Searching for: "${query}"`);
        
        let allObjects = [];
        let cursor = undefined;
        let totalFetched = 0;
        
        // Fetch objects in batches
        do {
          const objects = await env.IMAGE_BUCKET.list({ 
            limit: Math.min(1000, maxResults - totalFetched),
            cursor
          });
          
          allObjects = allObjects.concat(objects.objects);
          cursor = objects.truncated ? objects.cursor : undefined;
          totalFetched += objects.objects.length;
          
        } while (cursor && totalFetched < maxResults);
        
        // Filter based on search query
        const filtered = allObjects.filter(obj => {
          if (!query) return true;
          
          const searchText = [
            obj.key,
            obj.customMetadata?.originalUrl || '',
            obj.customMetadata?.userAgent || '',
            obj.customMetadata?.referer || '',
            JSON.stringify(obj.customMetadata || {})
          ].join(' ').toLowerCase();
          
          return searchText.includes(query.toLowerCase());
        });
        
        const result = {
          action: 'search',
          query: query,
          totalFetched: totalFetched,
          totalMatches: filtered.length,
          objects: filtered.slice(0, maxResults)
        };
        
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 
            'content-type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Default help response
      const help = {
        endpoints: {
          'list': '?action=list&limit=10&prefix=some_prefix&cursor=CURSOR',
          'skip': '?action=skip&skipCount=5000&limit=10',
          'recent': '?action=recent&limit=10&maxScan=10000',
          'metadata': '?action=metadata&key=OBJECT_KEY',
          'download': '?action=download&key=OBJECT_KEY',
          'search': '?action=search&query=searchterm&maxResults=50'
        },
        examples: [
          '?action=list&limit=5',
          '?action=search&query=cat&maxResults=10',
          '?action=metadata&key=prompt_Beautiful_sunset_over-12345678'
        ]
      };
      
      return new Response(JSON.stringify(help, null, 2), { 
        headers: { 
          'content-type': 'application/json',
          ...corsHeaders
        }
      });
      
    } catch (error) {
      console.error('R2 Error:', error);
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }, null, 2), { 
        status: 500,
        headers: { 
          'content-type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

function getFileExtension(contentType) {
  const typeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', 
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff'
  };
  
  return typeMap[contentType?.toLowerCase()] || '.bin';
}
