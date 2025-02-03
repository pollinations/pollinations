import { Request, Response, Express } from 'express-serve-static-core'
import debug from 'debug'

const log = debug('pollinations:feed')

// Map to store connected clients
const connectedClients = new Map()

function sendToFeedListeners(response: string, requestParams: TextRequestData, ip: string) {
    // SUGGESTION: Make certain requests private, if suggested by the user
    if(requestParams.private) return

    for (const [_, send] of connectedClients) {
        log('broadcasting response', response, 'to', connectedClients.size)
        send(response, requestParams, ip)
    }
}

function setupFeedEndpoint(app: Express) {
    app.get('/feed', (req: Request, res: Response) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        })

        // Add the client to a list of connected clients
        const clientId = Date.now()
        connectedClients.set(clientId, (response: string, parameters: any) => {
            const eventData = {
                response,
                parameters,
                // ip
            }
            // Properly encode the data for SSE
            const encodedData = JSON.stringify(eventData)
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
            res.write(`data: ${encodedData}\n\n`)
        })

        // Remove the client when they disconnect
        req.on('close', () => {
            connectedClients.delete(clientId)
        })
    })
}

export { setupFeedEndpoint, sendToFeedListeners }
