/**
 * Shared IP-based queue management for Pollinations services
 * This module provides a consistent way to handle rate limiting across services
 * 
 * Usage:
 * import { enqueue } from '../shared/ipQueue.js';
 * await enqueue(req, () => processRequest(), { interval: 6000 });
 */

import PQueue from 'p-queue';
import { incrementUserMetric } from './userMetrics.js';
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
  // Extract useful request info for logging
  const url = req.url || 'no-url';
  const method = req.method || 'no-method';
  const path = url.split('?')[0] || 'no-path';
  const ip = req.headers?.get?.('cf-connecting-ip') || 
            req.headers?.['cf-connecting-ip'] || 
            req.ip || 
            'unknown';
  
  authLog('Processing request: %s %s from IP: %s', method, path, ip);
  
  // Get authentication status
  authLog('Checking authentication for request: %s', path);
  const authResult = await shouldBypassQueue(req);
  
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
      // authContextLength removed as authContext is no longer used
      request: { method, path, ip },
      issuedAt: new Date().toISOString()
    };
    
    errorLog('Throwing authentication error with status %d for request: %s %s', 
             error.status, method, path);
    throw error;
  }
  
  // Check if this is a nectar tier user - they skip the queue entirely
  // Allow all nectar tier users to bypass the queue regardless of authentication method
  if (authResult.tier === 'nectar' && authResult.tokenAuth) {
    log('Nectar tier user detected - skipping queue entirely');
    return fn(); // Execute immediately, skipping the queue
  }
  
  // For all other users, always use the queue but adjust the interval and cap based on authentication type
  // This ensures all requests are subject to rate limiting and queue size constraints
  
  // Apply tier-based concurrency limits for token-authenticated requests
  if (authResult.tokenAuth) {
    // Set tier-based cap for token authentication
    if (authResult.tier === 'seed') {
      cap = 3; // Seed tier gets 3 simultaneous requests
      log('Token authenticated (seed tier) - using cap: 3');
    } else if (authResult.tier) {
      cap = 20; // Higher tiers get 20 simultaneous requests
      log('Token authenticated (%s tier) - using cap: 20', authResult.tier);
    } else {
      cap = 20; // Default to higher tier behavior for authenticated users
      log('Token authenticated (no tier specified) - using cap: 20');
    }
    
    // Token authentication gets zero interval (no delay between requests)
    if (interval > 0) {
      log('Token authenticated request - using zero interval in queue');
      interval = 0;
    }
  } else if (authResult.referrerAuth) {
    // Referrer-based authentication still uses service-provided cap and standard interval
    log('Referrer authenticated request - using service-provided cap: %d', cap);
  } else {
    // Non-authenticated requests use service-provided cap and interval
    log('Non-authenticated request - using service-provided cap: %d', cap);
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
    if (authResult.userId) {
      incrementUserMetric(authResult.userId, 'ip_queue_full_count');
    }
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
