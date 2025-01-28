import { Env } from './image-worker';

export async function handleSSE(request: Request, env: Env): Promise<Response> {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Set up connection to origin
  const originResponse = await fetch(`${env.ORIGIN_SERVER}/feed`, {
    headers: {
      ...request.headers,
      'Host': new URL(request.url).hostname,
      'X-Real-IP': request.headers.get('cf-connecting-ip') || '',
      'X-Forwarded-For': request.headers.get('cf-connecting-ip') || '',
      'X-Forwarded-Proto': 'https'
    }
  });

  if (!originResponse.ok) {
    return new Response('Origin server error', { status: 502 });
  }

  // Forward SSE events
  const reader = originResponse.body?.getReader();
  if (!reader) {
    return new Response('Invalid response from origin', { status: 502 });
  }

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch (error) {
      console.error('SSE Error:', error);
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}