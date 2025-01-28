import { Env } from './image-worker';

export async function generateImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const prompt = decodeURIComponent(url.pathname.split('/prompt/')[1]);
  const params = Object.fromEntries(url.searchParams);

  // Forward request to origin server
  const response = await fetch(`${env.ORIGIN_SERVER}${url.pathname}${url.search}`, {
    method: request.method,
    headers: {
      ...request.headers,
      'Host': new URL(env.ORIGIN_SERVER).hostname,
      'X-Real-IP': request.headers.get('cf-connecting-ip') || '',
      'X-Forwarded-For': request.headers.get('cf-connecting-ip') || '',
      'X-Forwarded-Proto': 'https'
    }
  });

  // Handle errors
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate image');
  }

  return response;
}