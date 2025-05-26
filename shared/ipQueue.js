/**
 * Shared IP-based queue management for Pollinations services
 * This module provides a consistent way to handle rate limiting across services
 * 
 * Usage:
 * import { enqueue } from '../shared/ipQueue.js';
 * await enqueue(req, () => processRequest(), { interval: 6000 });
 */

import PQueue from 'p-queue';
import { shouldBypassQueue } from './auth-utils.js';

// In-memory queue storage
const queues = new Map();

// Global auth context - should be set at service startup
let globalAuthCtx = { legacyTokens: [], allowlist: [] };

/**
 * Set the global authentication context
 * @param {Object} ctx - Authentication context
 * @param {string[]|string} [ctx.legacyTokens] - Legacy tokens to check
 * @param {string[]|string} [ctx.allowlist] - Allowlisted domains
 */
export function setAuthContext(ctx) {
  globalAuthCtx = ctx;
}

/**
 * Enqueue a function to be executed based on IP address
 * Requests with valid tokens or from allowlisted domains bypass the queue
 * 
 * @param {Request|Object} req - The request object
 * @param {Function} fn - The function to execute
 * @param {Object} options - Queue options
 * @param {number} [options.interval=6000] - Time between requests in ms
 * @param {number} [options.cap=1] - Number of requests allowed per interval
 * @returns {Promise<any>} Result of the function execution
 */
export async function enqueue(req, fn, { interval=6000, cap=1 }={}) {
  const { bypass } = await shouldBypassQueue(req, globalAuthCtx);
  if (bypass) return fn();
  
  const ip = req.headers.get?.('cf-connecting-ip') || 
             req.headers['cf-connecting-ip'] || 
             req.ip || 
             'unknown';
             
  if (!queues.has(ip)) {
    queues.set(ip, new PQueue({ concurrency: 1, interval, intervalCap: cap }));
  }
  
  return queues.get(ip).add(fn);
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
