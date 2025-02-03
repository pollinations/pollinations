import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'
import { Request } from 'express-serve-static-core'

const log = debug('pollinations:ipBlocking')
const errorLog = debug('pollinations:ipBlocking:error')

const BLOCKED_IPS_LOG = path.join(process.cwd(), 'blocked_ips.txt')
const blockedIPs = new Set<string>()

const BANNED_PHRASES = [
    '600-800 words'
]

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

export function isIPBlocked(ip: string | null | undefined): boolean {
    if (!ip) return false
    return blockedIPs.has(ip)
}

export async function loadBlockedIPs() {
    try {
        const data = await fs.readFile(BLOCKED_IPS_LOG, 'utf8')
        const ips = data.split('\n').filter(ip => ip.trim())
        for (const ip of ips) {
            blockedIPs.add(ip.trim())
        }
        log(`Loaded ${blockedIPs.size} blocked IPs from file`)
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            errorLog('Error loading blocked IPs:', error)
        }
    }
}

export function getIp(req: Request): string {
    const ip = (req.headers['x-bb-ip'] ?? 
                req.headers['x-nf-client-connection-ip'] ?? 
                req.headers['x-real-ip'] ?? 
                req.headers['x-forwarded-for'] ?? 
                req.headers['referer'] ?? 
                req.socket?.remoteAddress) as (string | undefined)
    
    if (!ip) return 'no_ip'

    const ipSegments = ip.split('.').slice(0, 3).join('.')
    // if (ipSegments === '128.116')
    //     throw new Error('Pollinations cloud credits exceeded. Please try again later.')

    return ipSegments
}

export async function checkBannedPhrases(messages: Conversation, ip: string): Promise<void> {
    const messagesString = JSON.stringify(messages).toLowerCase()
    for (const phrase of BANNED_PHRASES) {
        if (messagesString.includes(phrase.toLowerCase())) {
            await blockIP(ip)
            throw new Error(`Message contains banned phrase. IP has been blocked.`)
        }
    }
}
