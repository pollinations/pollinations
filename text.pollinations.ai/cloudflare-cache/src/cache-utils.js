import stringify from 'fast-json-stable-stringify';

const COMMON = ['model','seed','stream','temperature','max_tokens','top_p',
                'frequency_penalty','presence_penalty','stop','logit_bias'];
const GET_ONLY  = ['prompt','json','system'];
const POST_ONLY = ['messages','functions','function_call',
                   'tools','tool_choice','response_format'];

/* -------- key generation (unchanged) ------------------------------------ */
export async function generateCacheKey(url, body=null) {
  const u  = new URL(url);
  const qp = {};

  [...COMMON, ...GET_ONLY].forEach(p => {
    const vals = u.searchParams.getAll(p);
    if (vals.length) qp[p] = vals.map(v =>
      v === '' || v === 'true' ? true :
      v === 'false' ? false :
      Number.isFinite(+v) ? +v : v
    ).sort();
  });

  const bodyPick = {};
  if (body) [...COMMON, ...POST_ONLY].forEach(f => {
    if (body[f] !== undefined) bodyPick[f] = body[f];
  });

  const canon = u.origin + u.pathname +
                (Object.keys(qp).length ? '?' + stringify(qp) : '') +
                stringify(bodyPick);

  const digest = await crypto.subtle.digest('SHA-256',
                    new TextEncoder().encode(canon));
  return [...new Uint8Array(digest)]
          .map(b => b.toString(16).padStart(2,'0')).join('');
}

/* -------- response caching --------------------------------------------- */
const TRIM = 512;
const sanitize = v =>
  v === undefined || v === null ? undefined
    : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, TRIM);

/** Store body + flexible metadata in R2 */
export async function cacheResponse(bucket, key, resp, url='', req=null) {
  const clone = resp.clone();
  const buf   = await clone.arrayBuffer();
  const ct    = clone.headers.get('content-type') || '';
  const wasStreaming = ct.startsWith('text/event-stream');

  /* ---- build metadata object in a generic way ---- */
  const meta = {
    originalUrl : sanitize(url),
    cachedAt    : new Date().toISOString(),
    isStreaming : wasStreaming.toString()
  };

  // chosen request headers
  ['cf-connecting-ip','x-forwarded-for','user-agent',
   'referer','referrer','accept-language','cf-ray'].forEach(h => {
      const val = req?.headers.get(h);
      if (val) meta[h.replace(/-/g,'_')] = sanitize(val);
  });
  meta.method = req?.method;

  // flatten request.cf (primitives only)
  const cf = req?.cf || {};
  for (const [k,v] of Object.entries(cf)) {
    if (typeof v !== 'object' || v === null) meta[k] = sanitize(v);
  }
  // stringify botManagement & detectionIds if present
  if (cf.botManagement)   meta.botManagement   = sanitize(cf.botManagement);
  if (cf.detectionIds)    meta.detectionIds    = sanitize(cf.detectionIds);

  await bucket.put(key, buf, {
    httpMetadata   : { contentType: ct },
    customMetadata : meta
  });
  return resp;
}
