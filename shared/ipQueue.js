/**
 * Shared IP-based queue management for Pollinations services
 * This module provides a consistent way to handle rate limiting across services
 * 
 * Usage:
 * import { enqueue } from '../shared/ipQueue.js';
 * await enqueue(req, () => processRequest(), { interval: 6000 });
 */

import PQueue from 'p-queue';
import debug from 'debug';
import { shouldBypassQueue } from './auth-utils.js';

// Set up debug loggers with namespaces
const log = debug('pollinations:queue');
const errorLog = debug('pollinations:error');
const authLog = debug('pollinations:auth');

// In-memory queue storage
const queues = new Map();

/**
 * Enqueue a function to be executed based on IP address
 * Requests with valid tokens or from allowlisted domains bypass the queue
 * 
 * @param {Request|Object} req - The request object
 * @param {Function} fn - The function to execute
 * @param {Object} options - Queue options
 * @param {number} [options.interval=6000] - Time between requests in ms
 * @param {number} [options.cap=1] - Number of requests allowed per interval
 * @param {boolean} [options.forceQueue=false] - Force queuing even for authenticated requests
 * @param {number} [options.maxQueueSize] - Maximum queue size per IP (throws error if exceeded)
 * @returns {Promise<any>} Result of the function execution
 */
export async function enqueue(req, fn, { interval=6000, cap=1, forceQueue=false, maxQueueSize }={}) {
  // Create auth context from environment variables (loaded by env-loader.js via auth-utils.js import)
  const authContext = {
    legacyTokens: process.env.LEGACY_TOKENS ? process.env.LEGACY_TOKENS.split(',') : [],
    allowlist: process.env.ALLOWLISTED_DOMAINS ? process.env.ALLOWLISTED_DOMAINS.split(',') : []
  };
  
  // Log authentication context
  authLog('Authentication context created with %d legacy tokens and %d allowlisted domains', 
          authContext.legacyTokens.length,
          authContext.allowlist.length);
  
  // Extract useful request info for logging
  const url = req.url || 'no-url';
  const method = req.method || 'no-method';
  const path = url.split('?')[0] || 'no-path';
  const ip = req.headers?.get?.('cf-connecting-ip') || 
            req.headers?.['cf-connecting-ip'] || 
            req.ip || 
            'unknown';
  
  authLog('Processing request: %s %s from IP: %s', method, path, ip);
  
  // Get authentication status with auth context
  authLog('Checking authentication for request: %s', path);
  const authResult = await shouldBypassQueue(req, authContext);
  
  // Log the authentication result with tier information
  authLog('Authentication result: reason=%s, authenticated=%s, userId=%s, tier=%s', 
          authResult.reason, 
          authResult.authenticated, 
          authResult.userId || 'none',
          authResult.tier || 'none');
  
  // Check if there's an error in the auth result (invalid token)
  if (authResult.error) {
    // Detailed logging of authentication errors
    errorLog('Authentication error: %s (status: %d)', 
             authResult.error.message, 
             authResult.error.status);
    
    // Log detailed debug info
    if (authResult.debugInfo) {
      authLog('Auth debug info: token source=%s, referrer=%s, authResult=%s',
              authResult.debugInfo.tokenSource || 'none',
              authResult.debugInfo.referrer || 'none',
              authResult.debugInfo.authResult);
    }
    
    // Create a proper error object to throw
    const error = new Error(authResult.error.message);
    error.status = authResult.error.status;
    error.details = authResult.error.details;
    
    // Add extra context for debugging
    error.queueContext = {
      authContextLength: JSON.stringify(authContext).length,
      request: { method, path, ip },
      issuedAt: new Date().toISOString()
    };
    
    errorLog('Throwing authentication error with status %d for request: %s %s', 
             error.status, method, path);
    throw error;
  }
  
  // Check if this is a nectar tier user - they skip the queue entirely
  // Allow all nectar tier users to bypass the queue regardless of authentication method
  if (authResult.tier === 'nectar') {
    log('Nectar tier user detected - skipping queue entirely');
    return fn(); // Execute immediately, skipping the queue
  }
  
  // For all other users, always use the queue but adjust the interval based on authentication type
  // This ensures all requests are subject to rate limiting and queue size constraints
  
  // Check the new, clearer authentication result fields
  if (authResult.tokenAuth && interval > 0) {
    // Only token authentication gets zero interval
    log('Token authenticated request - using zero interval in queue');
    interval = 0; // Token authentication means no delay between requests
  } else if (authResult.referrerAuth) {
    // Referrer-based authentication still uses standard interval
    log('Referrer authenticated request - using standard interval in queue');
  } else {
    // Non-authenticated requests use standard interval
    log('Non-authenticated request - using standard interval in queue');
  }
  
  // Check if queue exists for this IP and get its current size
  const currentQueueSize = queues.get(ip)?.size || 0;
  const currentPending = queues.get(ip)?.pending || 0;
  const totalInQueue = currentQueueSize + currentPending;
  
  // Check if adding to queue would exceed maxQueueSize
  if (maxQueueSize && totalInQueue >= maxQueueSize) {
    const error = new Error(`Queue full for IP ${ip}: ${totalInQueue} requests already queued (max: ${maxQueueSize})`);
    error.status = 429; // Too Many Requests
    error.queueInfo = {
      ip,
      currentSize: currentQueueSize,
      pending: currentPending,
      total: totalInQueue,
      maxAllowed: maxQueueSize
    };
    log('Queue full for IP %s: size=%d, pending=%d, max=%d', ip, currentQueueSize, currentPending, maxQueueSize);
    throw error;
  }
  
  // Otherwise, queue the function based on IP
  log('Request queued for IP: %s (queue size: %d, pending: %d, forceQueue: %s)', 
      ip, currentQueueSize, currentPending, forceQueue);
  
  // Create queue for this IP if it doesn't exist
  if (!queues.has(ip)) {
    log('Creating new queue for IP: %s with interval: %dms, cap: %d', ip, interval, cap);
    queues.set(ip, new PQueue({ concurrency: 1, interval, intervalCap: cap }));
  }
  
  // Add to queue and return
  log('Adding request to queue for IP: %s (will be #%d in queue)', ip, totalInQueue + 1);
  return queues.get(ip).add(() => {
    log('Executing queued request for IP: %s', ip);
    return fn();
  });
}

/**
 * Clean up old queues to prevent memory leaks
 * Call this periodically (e.g., every hour)
 * @param {number} maxAgeMs - Maximum age of inactive queues in milliseconds
 */
export function cleanupQueues(maxAgeMs = 3600000) {
  const now = Date.now();
  
  for (const [ip, queue] of queues.entries()) {
    if (queue.lastUsed && (now - queue.lastUsed > maxAgeMs)) {
      queues.delete(ip);
    }
  }
}
