import debug from 'debug'
import { promises as fs } from 'fs'
import path from 'path'
import { Request } from 'express-serve-static-core'

const log = debug('pollinations:server')
const errorLog = debug('pollinations:error')
const BLOCKED_IPS_LOG = path.join(process.cwd(), 'blocked_ips.txt')

const BANNED_PHRASES = [
    '600-800 words'
]

const WHITELISTED_DOMAINS = [
    'pollinations',
    'thot',
    'ai-ministries.com',
    'localhost',
    'pollinations.github.io',
    '127.0.0.1',
]

const blockedIPs = new Set<string>()

/**
 * Blocks an IP address by adding it to the blockedIPs set and writing it to the log file
 * @param ip IP address to block
 */
export async function blockIP(ip: string): Promise<void> {
    // Only proceed if IP isn't already blocked
    if (!blockedIPs.has(ip)) {
        blockedIPs.add(ip)
        log('IP blocked:', ip)

        try {
            // Append IP to log file with newline
            await fs.appendFile(BLOCKED_IPS_LOG, `${ip}\n`, 'utf8')
        } catch (error) {
            errorLog('Failed to write blocked IP to log file:', error)
        }
    }
}

/**
 * Checks if an IP address is blocked
 * @param ip IP address to check
 * @returns true if IP is blocked, false otherwise
 */
export function isIPBlocked(ip: string | null | undefined): boolean {
    if (!ip) return false
    return blockedIPs.has(ip)
}

interface ChatMessage {
    role: string;
    content: string | any;
}

/**
 * Checks if any messages contain banned phrases and blocks the IP if found
 * @param messages Array of chat messages to check
 * @param ip IP address to block if banned phrases are found
 * @throws Error if banned phrases are found
 */
export async function checkBannedPhrases(messages: ChatMessage[], ip: string): Promise<void> {
    const messagesString = JSON.stringify(messages).toLowerCase()
    for (const phrase of BANNED_PHRASES) {
        if (messagesString.includes(phrase.toLowerCase())) {
            await blockIP(ip)
            throw new Error(`Message contains banned phrase. IP has been blocked.`)
        }
    }
}

// Load blocked IPs from file on startup
interface FileSystemError extends Error {
    code?: string;
}

/**
 * Loads blocked IPs from the log file into memory
 * @throws FileSystemError if there's an error reading the file (except for ENOENT)
 */
export async function loadBlockedIPs(): Promise<void> {
    try {
        const data = await fs.readFile(BLOCKED_IPS_LOG, 'utf8')
        const ips = data.split('\n').filter(ip => ip.trim())
        for (const ip of ips) {
            blockedIPs.add(ip.trim())
        }
        log(`Loaded ${blockedIPs.size} blocked IPs from file`)
    } catch (error) {
        const fsError = error as FileSystemError;
        if (fsError.code !== 'ENOENT') {
            errorLog('Error loading blocked IPs:', error)
        }
    }
}

// Function to get IP address
/**
 * Extracts and normalizes the IP address from a request
 * @param req Express request object
 * @returns Normalized IP address or 'no_ip' if none found
 */
export function getIp(req: Request): string {
    const ip = (req.headers['x-bb-ip'] ?? 
                req.headers['x-nf-client-connection-ip'] ?? 
                req.headers['x-real-ip'] ?? 
                req.headers['x-forwarded-for'] ?? 
                req.headers['referer'] ?? 
                req.socket?.remoteAddress) as (string | undefined)
    
    if (!ip) return 'no_ip'

    const ipSegments = ip.split('.').slice(0, 3).join('.')
    return ipSegments
}

/**
 * Checks if a referrer domain is in the whitelist
 * @param referrer Referrer URL to check
 * @returns true if domain is whitelisted, false otherwise
 */
export function isWhitelistedDomain(referrer: string): boolean {
    return WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain))
}

export { WHITELISTED_DOMAINS }
