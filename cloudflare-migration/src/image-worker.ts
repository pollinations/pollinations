import { Router } from './router';
import { handleSSE } from './sse-handler';
import { generateImage } from './image-generator';
import { rateLimit } from './rate-limit';

export interface Env {
  ORIGIN_SERVER: string;
  QUEUE: DurableObjectNamespace;
  STORAGE: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const router = new Router();

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      // Apply rate limiting
      await rateLimit(request, env);

      // Feed endpoint with SSE
      router.handle('/feed', async (request) => {
        return handleSSE(request, env);
      });

      // Image generation endpoint
      router.handle('/prompt/(.*)', async (request) => {
        const cache = caches.default;
        const cacheKey = new Request(request.url, {
          method: 'GET',
          headers: request.headers
        });

        let response = await cache.match(cacheKey);
        if (!response) {
          response = await generateImage(request, env);
          if (response.ok) {
            response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            await cache.put(cacheKey, response.clone());
          }
        }

        // Add CORS headers
        response = new Response(response.body, response);
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
      });

      // Models endpoint
      router.handle('/models', async () => {
        const models = ['flux-schnell', 'sdxl', 'kandinsky'];
        return new Response(JSON.stringify(models), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
          }
        });
      });

      return router.route(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: error.message || 'Internal Server Error',
        status: error.status || 500
      }), {
        status: error.status || 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};