import fs from 'fs';
import path from 'path';
import debug from 'debug';

const log = debug('pollinations:userlogger');

// Simple user logging - just specify usernames in environment variable
// Read DEBUG_USERS dynamically each time
const LOG_DIR = path.join(process.cwd(), 'user_logs');

/**
 * Check if user should be logged
 */
function shouldLogUser(username) {
    const DEBUG_USERS = process.env.DEBUG_USERS || '';
    if (!DEBUG_USERS) return false;
    if (DEBUG_USERS.toLowerCase() === 'all') return true;
    
    const users = DEBUG_USERS.split(',').map(u => u.trim().toLowerCase());
    return users.includes(username?.toLowerCase());
}

/**
 * Sanitize username for filesystem safety
 */
function sanitizeUsername(username) {
    return username.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/**
 * Log user request/response to file
 */
function logUserRequest(username, requestData, response = null, error = null, queueInfo = null) {
    if (!shouldLogUser(username)) return;
    
    ensureLogDir();
    
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        username,
        request: {
            model: requestData.model,
            messages: requestData.messages || [],
            temperature: requestData.temperature,
            stream: requestData.stream
        },
        queueInfo: queueInfo ? {
            ip: queueInfo.ip,
            queueSize: queueInfo.queueSize,
            pending: queueInfo.pending,
            total: queueInfo.total,
            position: queueInfo.position,
            enqueuedAt: queueInfo.enqueuedAt,
            tier: queueInfo.tier,
            authenticated: queueInfo.authenticated
        } : null,
        response: response ? {
            content: response.choices?.[0]?.message?.content,
            usage: response.usage,
            model: response.model
        } : null,
        error: error ? error.message : null
    };
    
    const logLine = `${timestamp} | ${JSON.stringify(logEntry)}\n`;
    
    // Create separate log file for each user
    const safeUsername = sanitizeUsername(username);
    const logFile = path.join(LOG_DIR, `${safeUsername}.log`);
    
    try {
        fs.appendFileSync(logFile, logLine);
        log(`Logged request for user: ${username} to ${logFile}`);
    } catch (err) {
        console.error('Failed to log user request:', err);
    }
}

export { shouldLogUser, logUserRequest };
