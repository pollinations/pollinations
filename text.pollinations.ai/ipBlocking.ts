import debug from 'debug'
import { promises as fs } from 'fs'
import path from 'path'
import { Request } from 'express-serve-static-core'
import { ChatMessage } from './types'

const log = debug('pollinations:server')
const errorLog = debug('pollinations:error')
const BLOCKED_IPS_LOG = path.join(process.cwd(), 'blocked_ips.txt')

// Load configuration from environment or fallback to defaults
const BANNED_PHRASES = process.env.BANNED_PHRASES ? 
    process.env.BANNED_PHRASES.split(',') : 
    ['600-800 words']

// Domains must be exact matches or subdomains of these entries
const WHITELISTED_DOMAINS = process.env.WHITELISTED_DOMAINS ? 
    process.env.WHITELISTED_DOMAINS.split(',') : 
    [
        'pollinations.ai',
        'thot.ai',
        'ai-ministries.com',
        'localhost',
        'pollinations.github.io',
        '127.0.0.1'
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

/**
 * Checks if any messages contain banned phrases and blocks the IP if found
 * Only checks the most recent message for efficiency
 * @param messages Array of chat messages to check
 * @param ip IP address to block if banned phrases are found
 * @throws Error if banned phrases are found
 */
export async function checkBannedPhrases(messages: ChatMessage[], ip: string): Promise<void> {
    // Only check the latest message for efficiency
    const latestMessage = messages[messages.length - 1]
    if (!latestMessage?.content) return

    const content = typeof latestMessage.content === 'string' ? 
        latestMessage.content.toLowerCase() : 
        JSON.stringify(latestMessage.content).toLowerCase()

    for (const phrase of BANNED_PHRASES) {
        if (content.includes(phrase.toLowerCase())) {
            await blockIP(ip)
            throw new Error(`Message contains banned phrase. IP has been blocked.`)
        }
    }
}

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

    // Only use first 3 segments of IP for privacy and to handle dynamic IPs
    // This allows blocking entire subnets while preserving user privacy
    const ipSegments = ip.split('.').slice(0, 3).join('.')
    return ipSegments
}

/**
 * Checks if a referrer domain is in the whitelist using proper domain matching
 * @param referrer Referrer URL to check
 * @returns true if domain is whitelisted, false otherwise
 */
export function isWhitelistedDomain(referrer: string): boolean {
    try {
        // Extract domain from referrer URL
        const domain = new URL(referrer).hostname.toLowerCase()
        
        return WHITELISTED_DOMAINS.some(whitelisted => {
            // Exact match
            if (domain === whitelisted) return true
            // Subdomain match (ensure it ends with .domain)
            if (domain.endsWith(`.${whitelisted}`)) return true
            return false
        })
    } catch (error) {
        // If URL parsing fails, do a more conservative check
        return WHITELISTED_DOMAINS.includes(referrer.toLowerCase())
    }
}

export { WHITELISTED_DOMAINS }
