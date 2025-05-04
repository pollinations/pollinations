import { generateCacheKey, cacheResponse } from './cache-utils.js';
import { proxyToOrigin } from './text-proxy.js';

const NON_CACHE_PATHS = ['/models', '/feed', '/openai/models'];

//‑‑ utility ----------------------------------------------------
const isCacheable = u =>
  !u.searchParams.has('no-cache') &&
  !NON_CACHE_PATHS.some(p => u.pathname.startsWith(p));

async function parseBody(req) {
  if (req.method !== 'POST') return { body:null, clone:req };
  const clone = req.clone();
  try   { return { body:await req.json(), clone }; }
  catch { return { body:null, clone }; }
}

const getCached = (env,key) =>
  env.TEXT_BUCKET.get(key,{ httpMetadata:true, customMetadata:true });

const headersForCached = obj => {
  const h = new Headers();
  const wasStreaming = obj.customMetadata?.isStreaming === 'true';
  h.set('content-type',
        wasStreaming ? 'text/event-stream; charset=utf-8'
                     : (obj.httpMetadata?.contentType ||
                        'application/json; charset=utf-8'));
  h.set('cache-control','public, max-age=31536000, immutable');
  h.set('x-cache','HIT');
  h.set('x-cached-at', obj.customMetadata?.cachedAt || 'unknown');
  h.set('access-control-allow-origin','*');
  return h;
};
//‑‑ main -------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS pre‑flight
    if (request.method === 'OPTIONS')
      return new Response(null,{ headers:{
        'access-control-allow-origin':'*',
        'access-control-allow-methods':'GET, POST, OPTIONS',
        'access-control-allow-headers':'Content-Type, Authorization, X-Requested-With',
        'access-control-max-age':'86400'
      }});

    if (!isCacheable(url)) return proxyToOrigin(request, env);

    const { body:reqBody, clone:reqClone } = await parseBody(request);
    if (request.method === 'POST' && reqBody === null)
      return proxyToOrigin(reqClone, env);

    const key = await generateCacheKey(url, reqBody);
    const hit = await getCached(env, key);
    if (hit) return new Response(hit.body, { headers: headersForCached(hit) });

    // cache miss → proxy
    const originResp = await proxyToOrigin(reqClone, env);
    const clientHdrs = new Headers(originResp.headers);
    clientHdrs.set('x-cache','MISS');

    if (originResp.ok) {
      const ct = originResp.headers.get('content-type') || '';
      const textish = ct.startsWith('text/') || ct.includes('application/json');
      if (textish)
        ctx.waitUntil(cacheResponse(env.TEXT_BUCKET, key, originResp.clone(), url.toString()));
    }
    return new Response(originResp.body, {
      status: originResp.status,
      statusText: originResp.statusText,
      headers: clientHdrs
    });
  }
};
