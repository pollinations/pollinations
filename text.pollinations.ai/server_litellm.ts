import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import debug from 'debug'
import { promises as fs } from 'fs'
import path from 'path'
import PQueue, { QueueAddOptions } from 'p-queue'
import { availableModels } from './availableModels'

import litellm from 'litellm'

// Models
import { sendToAnalytics } from './sendToAnalytics'
import { setupFeedEndpoint, sendToFeedListeners } from './feed'
import { getFromCache, setInCache, createHashKey } from './cache'
import { Request, Response, } from 'express-serve-static-core'
import PriorityQueue from 'p-queue/dist/priority-queue'
import { readReadableStream } from './generatorImports'
import { ConsistentResponse, ResultStreaming } from 'litellm/dist/src/types'
import { ServerResponse } from 'http'

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

async function blockIP(ip: string): Promise<void> {
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

// TODO: Determine if requests without an IP should be blocked or not
function isIPBlocked(ip: string | null | undefined): boolean {
    if (!ip) return false
    return blockedIPs.has(ip)
}

async function checkBannedPhrases(messages: Conversation, ip: string): Promise<void> {
    const messagesString = JSON.stringify(messages).toLowerCase()
    for (const phrase of BANNED_PHRASES) {
        if (messagesString.includes(phrase.toLowerCase())) {
            await blockIP(ip)
            throw new Error(`Message contains banned phrase. IP has been blocked.`)
        }
    }
}

const app = express()

// Load blocked IPs from file on startup
async function loadBlockedIPs() {
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

// Load blocked IPs before starting server
loadBlockedIPs().catch(error => {
    errorLog('Failed to load blocked IPs:', error)
})

// Middleware to block IPs
app.use((req, res, next) => {
    const ip = getIp(req)

    if (isIPBlocked(ip)) res.status(403).end()

    next()
})

// Remove the custom JSON parsing middleware and use the standard bodyParser
app.use(bodyParser.json({ limit: '5mb' }))
app.use(cors())

// // Rate limiting setup
// const limiter = rateLimit({
//     windowMs: 60 * 1000, // 1 minute
//     max: 200, // 40 requests per windowMs
//     message: {
//         error: {
//             type: 'rate_limit_error',
//             message: 'Rate limit exceeded. Maximum 40 requests per minute.',
//             suggestion: 'Please wait before making more requests.'
//         }
//     },
//     skip: (req) => {
//         const requestData = getRequestData(req)
//         return requestData.isRobloxReferrer
//     },
//     // Use X-Forwarded-For header but validate it's from our trusted proxy
//     trustProxy: false
// })

// Apply rate limiting to all routes
// app.use(limiter)

// New route handler for root path
app.get('/', (req, res) => {
    res.redirect('https://sur.pollinations.ai')
})

app.set('trust proxy', true)

// Queue setup per IP address
type IPQueue = PQueue<PriorityQueue, QueueAddOptions>
const queues = new Map<string, IPQueue>()

export function getQueue(ip: string): IPQueue {
    if (!queues.has(ip)) queues.set(ip, new PQueue({ concurrency: 1, interval: 3000, intervalCap: 1 }))
    return queues.get(ip)!
}

// Function to get IP address
export function getIp(req: Request) {
    const ip = (req.headers['x-bb-ip'] ?? req.headers['x-nf-client-connection-ip'] ?? req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.headers['referer'] ?? req.socket?.remoteAddress) as (string | undefined)
    if (!ip) return 'no_ip'

    const ipSegments = ip.split('.').slice(0, 3).join('.')
    // if (ipSegments === '128.116')
    //     throw new Error('Pollinations cloud credits exceeded. Please try again later.')

    return ipSegments
}

// GET /models request handler
app.get('/models', (_, res) => { res.json(availableModels) })

setupFeedEndpoint(app)

// Helper function to handle both GET and POST requests
async function handleRequest(req: Request, res: Response, requestData: TextRequestData) {
    log('Request: model=%s referrer=%s', requestData.model, requestData.referrer)
    log('Request data: %o', requestData)

    try {
        // TODO: Uncomment this
        // Check if completion contains an error
        // if (completion.error) {
        // throw new Error(completion.error?.message ?? 'Unknown error from provider')
        // }

        async function onStreamFinish(response: ConsistentResponse) {
            log('completion: %o', response)
            const responseText = response.choices[0].message.content ?? ''

            const cacheKey = createHashKey(requestData)
            setInCache(cacheKey, responseText)
            log('Generated response', responseText)

            // Extract token usage data
            const tokenUsage = response.usage ?? {}

            // only send if not roblox
            if (!shouldBypassDelay(req) && !requestData.isImagePollinationsReferrer) {
                sendToFeedListeners(responseText, {
                    ...requestData,
                    ...tokenUsage
                }, getIp(req))
            }

            // Track successful completion with token usage
            await sendToAnalytics(req, 'textGenerated', {
                ...requestData,
                success: true,
                cached: false,
                responseLength: responseText?.length,
                streamMode: requestData.stream,
                plainTextMode: requestData.plainTextResponse,
                ...tokenUsage
            })

            return responseText
        }

        if (requestData.stream) {
            const response = await litellm.completion({
                ...requestData,
                model: requestData.model ?? 'gpt-3.5-turbo',
                messages: requestData.messages ?? [],
                stream: true
            })
            log('completion: %o', response)

            sendAsOpenAIStream(res, response, onStreamFinish)
        } else {
            const response = await litellm.completion({
                ...requestData,
                model: requestData.model ?? 'gpt-3.5-turbo',
                messages: requestData.messages ?? [],
                stream: false
            })

            const text = await onStreamFinish(response)

            if (requestData.plainTextResponse) {
                sendContentResponse(res, text)
            } else {
                sendOpenAIResponse(res, response)
            }
        }
    } catch (error) {
        sendErrorResponse(res, req, error, requestData)
    }
    // if (!shouldBypassDelay(req)) {
    //     await sleep(3000)
    // }
}

// Function to check if delay should be bypassed
export const shouldBypassDelay = (req: Request): boolean => getRequestData(req).isRobloxReferrer ?? getRequestData(req).isImagePollinationsReferrer ?? false

// TODO: Figure out error and errorResponse types
// Helper function for consistent error responses
export async function sendErrorResponse(res: Response, req: Request, error: any, requestData: TextRequestData, statusCode = 500) {
    const errorResponse: any = {
        error: error.message || 'An error occurred',
        status: statusCode
    }

    if (error.response?.data) {
        errorResponse.details = error.response.data
    }

    errorLog('Error occurred: %O', errorResponse)
    errorLog('Stack trace: %s', error.stack)

    // Log detailed error information to stderr
    // console.error('Error occurred:', JSON.stringify(errorResponse, null, 2))
    // console.error('Stack trace:', error.stack)

    // Track error event
    await sendToAnalytics(req, 'textGenerationError', {
        error: error.message,
        errorType: error.name,
        errorCode: error.code,
        statusCode,
        model: requestData?.model
    })

    res.status(statusCode).json(errorResponse)
}

// Helper function for consistent success responses
export function sendOpenAIResponse(res: Response, completion: unknown) {
    res.setHeader('Content-Type', 'application/json charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.json(completion)
}

export function sendContentResponse(res: Response, text: string) {
    res.setHeader('Content-Type', 'text/plain charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(text)
}

// Common function to handle request data
export function getRequestData(req: Request): TextRequestData {
    const data = { ...(req.query ?? {}), ...(req.body ?? {}) }

    const jsonMode = data.jsonMode ||
        (typeof data.json === 'string' && data.json.toLowerCase() === 'true') ||
        (typeof data.json === 'boolean' && data.json === true) ||
        data.response_format?.type === 'json_object'

    const seed = data.seed ? parseInt(data.seed, 10) : undefined
    const model = data.model ?? 'openai'
    const systemPrompt = data.system ? data.system : undefined
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined

    const referrer = getReferrer(req, data)
    const isImagePollinationsReferrer = WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain))
    const isRobloxReferrer = referrer.toLowerCase().includes('roblox')
    const stream = data.stream || false

    const messages: Conversation = data.messages || [{ role: 'user', content: req.params[0] }]
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt })
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        isImagePollinationsReferrer,
        isRobloxReferrer,
        referrer,
        stream
    }
}

// Helper function to get referrer from request
export const getReferrer = (req: Request, data: any): string => req.headers.referer ?? req.headers.referrer ?? data.referrer ?? 'unknown'

// Helper function to process requests with queueing and caching logic
export async function processRequest(req: Request, res: Response, requestData: TextRequestData) {
    const ip = getIp(req)

    // Check for banned phrases first
    try {
        if (requestData.messages) await checkBannedPhrases(requestData.messages, ip ?? 'no_ip')
    } catch (error) {
        return sendErrorResponse(res, req, error, requestData, 403)
    }

    const cacheKey = createHashKey(requestData)

    // Check cache first
    const cachedResponse = getFromCache(cacheKey)
    if (cachedResponse) {
        log('Cache hit for key:', cacheKey)

        // Extract token usage data from cached response
        const cachedTokenUsage = cachedResponse.usage ?? {}

        // Track cache hit in analytics with token usage
        await sendToAnalytics(req, 'textCached', {
            ...requestData,
            success: true,
            cached: true,
            responseLength: cachedResponse?.choices?.[0]?.message?.content?.length,
            streamMode: requestData.stream,
            plainTextMode: requestData.plainTextResponse,
            cacheKey: cacheKey,
            ...cachedTokenUsage
        })

        if (requestData.plainTextResponse) {
            sendContentResponse(res, cachedResponse?.choices?.[0]?.messages?.content)
        } else {
            log('Cache hit for key:', cacheKey)
            if (requestData.stream) sendAsOpenAIStream(res, cachedResponse, () => { })
            else sendOpenAIResponse(res, cachedResponse)
        }

        return
    }

    if (isIPBlocked(ip)) {
        errorLog('Blocked IP:', ip)

        const errorResponse = {
            error: 'Forbidden',
            status: 403,
            details: {
                blockedIp: ip,
                timestamp: new Date().toISOString()
            }
        }

        return res.status(403).json(errorResponse)
    }

    // const queue = getQueue(ip ?? 'no_ip')
    // if (queue.size >= 60) {
    //     errorLog('Queue size limit exceeded for IP: %s', ip)
    //     const errorResponse = {
    //         error: 'Too Many Requests',
    //         status: 429,
    //         details: {
    //             queueSize: queue.size,
    //             maxQueueSize: 60,
    //             timestamp: new Date().toISOString()
    //         }
    //     }
    //     return res.status(429).json(errorResponse)
    // }

    const bypassQueue = shouldBypassDelay(req)

    if (bypassQueue) await handleRequest(req, res, requestData)
    else await getQueue(ip ?? 'no_ip').add(() => handleRequest(req, res, requestData))
}

// POST request handler
app.post('/', async (req: Request, res: Response) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        res.status(400).json({ error: 'Invalid messages array' })
        return
    }

    const requestParams = getRequestData(req)

    try {
        await processRequest(req, res, { ...requestParams, plainTextResponse: true })
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams)
    }
})

app.get('/openai/models', (req, res) => {
    const models = availableModels.map(model => ({
        id: model.name,
        object: 'model',
        created: Date.now(),
        owned_by: model.name
    }))

    res.json({
        object: 'list',
        data: models
    })
})

// POST /openai/* request handler
app.post('/openai*', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
        return sendErrorResponse(res, req, new Error('Invalid messages array'), req.body, 400)
    }

    const requestParams = getRequestData(req)

    try {
        await processRequest(req, res, requestParams)
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams)
    }
})

async function sendAsOpenAIStream(res: Response, completion: ResultStreaming, streamFinishHandler: Function) {
    res.setHeader('Content-Type', 'text/event-stream charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let text = ''

    for await (const chunk of completion) {
        res.write(`data: ${chunk}\n\n`)
    }

    res.write('data: [DONE]\n\n')  // Add the [DONE] message for OpenAI compatibility

    // TODO: Fix this
    // streamFinishHandler()

    res.end()
}

export default app

// GET request handler (catch-all)
app.get('/*', async (req, res) => {
    const requestData = getRequestData(req)
    try {
        await processRequest(req, res, { ...requestData, plainTextResponse: true })
    } catch (error) {
        sendErrorResponse(res, req, error, requestData)
    }
})
