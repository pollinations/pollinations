/**
 * Image proxy functionality for Cloudflare Worker
 * Following the "thin proxy" design principle - minimal processing, direct forwarding
 */

import { getClientIp } from './ip-utils.js';

/**
 * Proxy a request to the original service
 * @param {Request} request - The original request
 * @param {Object} env - The environment object
 * @param {string} originHost - The host to proxy the request to
 * @returns {Promise<Response>} - The response from the origin
 */
export async function proxyToOrigin(request, env, originHost) {
  // Log the original request details
  const clientIP = getClientIp(request);
  console.log('Proxying request from client IP:', clientIP);
  
  // Replace the hostname with the origin service
  const url = new URL(request.url);
  const originalUrl = url.toString();
  url.hostname = originHost || env.ORIGIN_HOST || 'image.pollinations.ai';
  const targetUrl = url.toString();
  
  console.log(`Forwarding request from ${originalUrl} to ${targetUrl}`);
  
  // Create a new request to the origin - preserving all original headers
  const headers = new Headers(request.headers);
  
  // Add or modify headers to ensure proper forwarding
  headers.set('host', url.hostname);
  
  // Forward the client IP address to the origin server
  // These are the headers that the origin server checks in getIp.js
  if (clientIP) {
    headers.set('x-forwarded-for', clientIP);
    headers.set('x-real-ip', clientIP);
    headers.set('cf-connecting-ip', clientIP);
  }
  
  const originRequest = new Request(url.toString(), {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });
  
  // Forward the request to the origin - no transformation, just direct proxying
  console.log('Sending request to origin...');
  try {
    // Simply wait for the origin without a timeout - following the thin proxy principle
    const response = await fetch(originRequest);
    console.log('Origin response received');
    
    // Create a new response with all the original headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error('Error proxying to origin:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: {
        'content-type': 'application/json',
        'x-error': 'proxy_error'
      }
    });
  }
}
