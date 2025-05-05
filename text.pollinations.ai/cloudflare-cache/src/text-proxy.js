/**
 * Thin, header‑preserving proxy to the upstream model service.
 * Relies on Cloudflare to set Host / X‑Forwarded‑For correctly.
 */
export async function proxyToOrigin(request, env, host = env.ORIGIN_HOST) {

  if (!host)
    return new Response(JSON.stringify({ error:'ORIGIN_HOST env var missing' }),
                        { status:500, headers:{'content-type':'application/json'} });

  if (!host.startsWith('http'))
    host = `https://${host}`;

  const upstream = new URL(`${host}${new URL(request.url).pathname}${new URL(request.url).search}`);

  const originReq = new Request(upstream, {
    method:  request.method,
    headers: request.headers,
    body:    (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect:'follow'
  });

  try {
    console.log(`Proxying request to: ${upstream.toString()}`);
    const resp = await fetch(originReq);
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers
    });
  } catch (err) {
    console.error('Error proxying to origin:', err);
    return new Response(JSON.stringify({ error:'proxy_error', detail:err.message }),
                        { status:502, headers:{'content-type':'application/json'} });
  }
}
