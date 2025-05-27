/**
 * Example of how to expose cache inspection endpoints
 * This could be added to your main worker or as a separate debug worker
 */

// Example endpoint handlers for cache inspection
export const cacheInspectionHandlers = {
  /**
   * GET /_cache/pairs - List all cached request-response pairs
   */
  async listPairs(request, env) {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    
    const pairs = await listCachedPairs(env, limit);
    
    return new Response(JSON.stringify({
      count: pairs.length,
      pairs: pairs.map(pair => ({
        key: pair.key,
        hasRequest: !!pair.request,
        hasResponse: !!pair.response,
        requestSize: pair.request?.size || 0,
        responseSize: pair.response?.size || 0,
        cached: pair.response?.uploaded || pair.request?.uploaded,
        metadata: pair.response?.metadata
      }))
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * GET /_cache/pair/:key - Get a specific request-response pair
   */
  async getPair(request, env, key) {
    const pair = await getCachedRequestResponsePair(env, key);
    
    if (!pair || !pair.response) {
      return new Response('Not found', { status: 404 });
    }
    
    // Parse request body if available
    let requestData = null;
    if (pair.request) {
      try {
        requestData = JSON.parse(pair.request.body);
      } catch {
        requestData = pair.request.body;
      }
    }
    
    // Get response body
    const responseBody = await pair.response.text();
    let responseData = responseBody;
    try {
      responseData = JSON.parse(responseBody);
    } catch {
      // Keep as string if not JSON
    }
    
    return new Response(JSON.stringify({
      key,
      request: {
        exists: !!pair.request,
        size: pair.request?.size || 0,
        uploaded: pair.request?.uploaded,
        body: requestData
      },
      response: {
        status: pair.response.status,
        headers: Object.fromEntries(pair.response.headers),
        body: responseData,
        metadata: pair.response.headers.get('x-cache-date') ? {
          cacheDate: pair.response.headers.get('x-cache-date'),
          cacheKey: pair.response.headers.get('x-cache-key')
        } : null
      }
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * DELETE /_cache/pair/:key - Delete a cached pair
   */
  async deletePair(request, env, key) {
    try {
      // Delete both request and response
      const results = await Promise.allSettled([
        env.TEXT_BUCKET.delete(key),
        env.TEXT_BUCKET.delete(`${key}-request`)
      ]);
      
      const deleted = {
        response: results[0].status === 'fulfilled',
        request: results[1].status === 'fulfilled'
      };
      
      return new Response(JSON.stringify({
        success: true,
        deleted
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Example integration in main worker fetch handler:
 * 
 * if (url.pathname.startsWith('/_cache/')) {
 *   // Handle cache inspection endpoints
 *   if (url.pathname === '/_cache/pairs' && request.method === 'GET') {
 *     return cacheInspectionHandlers.listPairs(request, env);
 *   }
 *   
 *   const pairMatch = url.pathname.match(/^\/_cache\/pair\/(.+)$/);
 *   if (pairMatch) {
 *     const key = pairMatch[1];
 *     if (request.method === 'GET') {
 *       return cacheInspectionHandlers.getPair(request, env, key);
 *     } else if (request.method === 'DELETE') {
 *       return cacheInspectionHandlers.deletePair(request, env, key);
 *     }
 *   }
 * }
 */
