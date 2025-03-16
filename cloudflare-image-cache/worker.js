import { Router } from 'itty-router';
import { Ai } from '@cloudflare/ai';

// Create router
const router = Router();

// Constants
const EMBEDDING_DIMENSIONS = 512;

/**
 * Generates a unique cache key from a request URL or prompt
 * @param {string} prompt - The image generation prompt
 * @param {Object} params - Additional parameters that affect the image
 * @returns {string} A cache key
 */
function generateCacheKey(prompt, params) {
  // Include important parameters in the cache key
  const relevantParams = {
    model: params.model || 'flux',
    seed: params.seed,
    width: params.width,
    height: params.height,
    // Include other params that affect image generation
  };
  
  // Create a stable string representation
  const paramsString = Object.entries(relevantParams)
    .filter(([_, value]) => value !== undefined)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
    
  return `${prompt}|${paramsString}`;
}

/**
 * Parse request URL to extract prompt and parameters for Pollinations.ai
 * @param {Request} request - The incoming request
 * @returns {Object} Object containing prompt and parameters
 */
async function parsePollinationsRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Example: /prompt/a%20beautiful%20sunset?width=1024&height=768&model=flux
  if (!path.startsWith('/prompt/')) {
    return { prompt: null, params: {} };
  }
  
  // Extract prompt from path
  const prompt = decodeURIComponent(path.substring('/prompt/'.length));
  
  // Parse query parameters
  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  
  // Set default dimensions if not specified
  params.width = parseInt(params.width) || 1024;
  params.height = parseInt(params.height) || 1024;
  params.model = params.model || 'flux';
  
  return { prompt, params };
}

/**
 * Generates embedding for a text prompt using Cloudflare AI
 * @param {Object} env - Environment variables
 * @param {string} prompt - Text prompt to embed
 * @returns {Promise<Float32Array>} Vector embedding
 */
async function generateEmbedding(env, prompt) {
  try {
    const ai = new Ai(env.AI);
    const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', { text: prompt });
    return data[0];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Searches for similar prompt embeddings in Vectorize
 * @param {Object} env - Environment variables
 * @param {Float32Array} embedding - Vector embedding to search with
 * @param {number} similarityThreshold - Minimum similarity score to consider a match
 * @returns {Promise<Object|null>} The most similar cached entry or null if no match found
 */
async function findSimilarEmbedding(env, embedding, similarityThreshold) {
  try {
    const threshold = parseFloat(similarityThreshold || env.SIMILARITY_THRESHOLD || 0.92);
    
    const results = await env.EMBEDDINGS.query(embedding, {
      topK: 1,
      returnMetadata: true,
    });
    
    if (results.length > 0 && results[0].score >= threshold) {
      return {
        cacheKey: results[0].id,
        metadata: results[0].metadata,
        score: results[0].score
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error searching for similar embeddings:', error);
    return null;
  }
}

/**
 * Store image in R2 and metadata in KV and Vectorize
 * @param {Object} env - Environment variables
 * @param {string} cacheKey - The cache key for the image
 * @param {ArrayBuffer} imageData - The image data to store
 * @param {Object} metadata - Metadata about the image
 * @param {Float32Array} embedding - Vector embedding for the prompt
 */
async function cacheImage(env, cacheKey, imageData, metadata, embedding) {
  try {
    // Store image in R2
    await env.IMAGE_BUCKET.put(cacheKey, imageData, {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      }
    });
    
    // Store metadata in KV
    await env.METADATA_KV.put(cacheKey, JSON.stringify({
      ...metadata,
      cachedAt: Date.now(),
    }));
    
    // Store embedding in Vectorize
    await env.EMBEDDINGS.insert([{
      id: cacheKey,
      values: embedding,
      metadata: {
        prompt: metadata.prompt,
        params: JSON.stringify(metadata.params),
        cachedAt: Date.now()
      }
    }]);
    
    console.log(`Cached image with key ${cacheKey}`);
  } catch (error) {
    console.error('Error caching image:', error);
    throw error;
  }
}

/**
 * Proxy request to the original Pollinations API
 * @param {Request} request - The original request
 * @param {Object} env - Environment variables
 * @returns {Promise<Response>} The API response
 */
async function proxyToPollinationsApi(request, env) {
  const url = new URL(request.url);
  const pollinationsUrl = new URL(url.pathname + url.search, env.POLLINATIONS_API_URL);
  
  console.log(`Proxying request to ${pollinationsUrl.toString()}`);
  
  const response = await fetch(pollinationsUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  
  // Clone the response so we can both return it and read the body
  const clonedResponse = response.clone();
  
  return {
    response: clonedResponse,
    body: await response.arrayBuffer()
  };
}

/**
 * Adds cache-related headers to the response
 * @param {Response} response - The original response
 * @param {Object} cacheInfo - Information about the cache status
 * @returns {Response} Response with added headers
 */
function addCacheHeaders(response, cacheInfo) {
  const headers = new Headers(response.headers);
  
  // Add custom cache headers
  headers.set('X-Cache-Status', cacheInfo.status);
  
  if (cacheInfo.similarity !== undefined) {
    headers.set('X-Cache-Similarity', cacheInfo.similarity.toFixed(4));
  }
  
  if (cacheInfo.key) {
    headers.set('X-Cache-Key', cacheInfo.key);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Handle the homepage
router.get('/', () => {
  return new Response(`
    <html>
      <head>
        <title>Pollinations Image Cache</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1 { color: #333; }
          code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
          .example { margin-bottom: 1rem; }
          a { color: #0070f3; }
        </style>
      </head>
      <body>
        <h1>Pollinations Image Cache</h1>
        <p>This service caches images from Pollinations.ai using text embedding similarity search.</p>
        
        <h2>Usage</h2>
        <p>Use the same URL format as the original Pollinations API:</p>
        <div class="example">
          <code>/prompt/your prompt here?width=1024&height=768&model=flux</code>
        </div>
        
        <h2>Cache Control</h2>
        <p>Add these parameters to control caching behavior:</p>
        <ul>
          <li><code>no-cache=true</code> - Bypass cache and generate a new image</li>
          <li><code>similarity=0.95</code> - Set a custom similarity threshold (0.0 to 1.0)</li>
        </ul>
        
        <h2>Examples</h2>
        <ul>
          <li><a href="/prompt/a beautiful sunset over mountains?width=1024&height=512">/prompt/a beautiful sunset over mountains?width=1024&height=512</a></li>
          <li><a href="/prompt/cyberpunk city at night?width=512&height=768">/prompt/cyberpunk city at night?width=512&height=768</a></li>
        </ul>
      </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    }
  });
});

// Main route handler for image requests
router.get('/prompt/*', async (request, env) => {
  // Check if cache is enabled
  const cacheEnabled = env.ENABLE_CACHE === 'true';
  
  // Parse the request
  const { prompt, params } = await parsePollinationsRequest(request);
  
  // Return 404 if no prompt is found
  if (!prompt) {
    return new Response('Not found', { status: 404 });
  }
  
  // Check if the request explicitly asks to bypass cache
  const bypassCache = request.url.includes('no-cache=true') || !cacheEnabled;
  
  // Custom similarity threshold from query param
  const customSimilarity = new URL(request.url).searchParams.get('similarity');
  const similarityThreshold = customSimilarity || env.SIMILARITY_THRESHOLD;
  
  // Generate cache key
  const cacheKey = generateCacheKey(prompt, params);
  
  let cacheInfo = {
    status: 'MISS',
    key: cacheKey
  };
  
  // Try to find cached image if not bypassing cache
  if (!bypassCache) {
    try {
      // First check exact match in KV
      const cachedMetadata = await env.METADATA_KV.get(cacheKey, { type: 'json' });
      
      if (cachedMetadata) {
        // Found exact match
        const cachedImage = await env.IMAGE_BUCKET.get(cacheKey);
        
        if (cachedImage) {
          console.log(`Cache hit for ${cacheKey}`);
          cacheInfo.status = 'HIT';
          
          return addCacheHeaders(new Response(cachedImage.body, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000', // 1 year
            }
          }), cacheInfo);
        }
      }
      
      // No exact match, try similarity search
      const embedding = await generateEmbedding(env, prompt);
      const similarEmbedding = await findSimilarEmbedding(env, embedding, similarityThreshold);
      
      if (similarEmbedding) {
        const cachedImage = await env.IMAGE_BUCKET.get(similarEmbedding.cacheKey);
        
        if (cachedImage) {
          console.log(`Similar cache hit for ${cacheKey} (score: ${similarEmbedding.score})`);
          cacheInfo.status = 'SIMILAR';
          cacheInfo.similarity = similarEmbedding.score;
          cacheInfo.key = similarEmbedding.cacheKey;
          
          return addCacheHeaders(new Response(cachedImage.body, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000', // 1 year
            }
          }), cacheInfo);
        }
      }
      
      // Store the embedding for later caching
      // (We pre-generate it here to avoid double computation)
      request.locals = { embedding };
    } catch (error) {
      console.error('Error checking cache:', error);
      // If cache check fails, continue to proxy request
    }
  }
  
  // Cache miss or bypass - proxy to the original API
  const { response, body } = await proxyToPollinationsApi(request, env);
  
  // Cache the response if caching is enabled
  if (cacheEnabled && !bypassCache && response.ok) {
    try {
      let embedding = request.locals?.embedding;
      
      // Generate embedding if not already done
      if (!embedding) {
        embedding = await generateEmbedding(env, prompt);
      }
      
      // Cache the image
      await cacheImage(env, cacheKey, body, {
        prompt,
        params,
        originalUrl: request.url
      }, embedding);
    } catch (error) {
      console.error('Error caching image:', error);
      // Continue even if caching fails
    }
  }
  
  // Return the response with cache headers
  return addCacheHeaders(new Response(body, {
    status: response.status,
    headers: response.headers
  }), cacheInfo);
});

// Catch-all handler for other routes
router.all('*', async (request, env) => {
  // Proxy all other requests directly to the original API
  const { response, body } = await proxyToPollinationsApi(request, env);
  return new Response(body, {
    status: response.status,
    headers: response.headers
  });
});

// Register fetch event handler
export default {
  async fetch(request, env, ctx) {
    // Add locals object for passing data between middlewares
    request.locals = {};
    
    // Handle request with the router
    return router.handle(request, env, ctx);
  }
};