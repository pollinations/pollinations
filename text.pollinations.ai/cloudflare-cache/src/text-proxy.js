/**
 * Thin, header‑preserving proxy to the upstream model service.
 * Relies on Cloudflare to set Host / X‑Forwarded‑For correctly.
 */
export async function proxyToOrigin(request, env, host = env.ORIGIN_HOST) {
  if (!host)
    return new Response(JSON.stringify({ error:'ORIGIN_HOST env var missing' }),
                        { status:500, headers:{'content-type':'application/json'} });

  const upstream = new URL(`https://${host}${new URL(request.url).pathname}${new URL(request.url).search}`);

  const originReq = new Request(upstream, {
    method:  request.method,
    headers: request.headers,
    body:    (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect:'follow'
  });

  try {
    const resp = await fetch(originReq);
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ error:'proxy_error', detail:err.message }),
                        { status:502, headers:{'content-type':'application/json'} });
  }
}
