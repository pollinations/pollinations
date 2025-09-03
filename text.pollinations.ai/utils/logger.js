/**
 * Simple logger utility for text.pollinations.ai
 */

import debug from 'debug';

/**
 * Create a logger instance for a specific module
 * @param {string} namespace - The namespace for the logger
 * @returns {Function} - Logger function
 */
export function createLogger(namespace) {
    const log = debug(`text.pollinations.ai:${namespace}`);
    return log;
}
