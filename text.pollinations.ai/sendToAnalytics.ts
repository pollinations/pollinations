import 'dotenv/config'
import debug from 'debug'
import fetch from 'node-fetch'
import { Request } from 'express-serve-static-core'

const measurementId = process.env.GA_MEASUREMENT_ID
const apiSecret = process.env.GA_API_SECRET

const logError = debug('pollinations:error')
const logAnalytics = debug('pollinations:analytics')

// Helper function to filter out complex values
function filterSimpleValues(obj: any) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => {
            const type = typeof value
            return value !== null && 
                   value !== undefined && 
                   (type === 'string' || 
                    type === 'number' || 
                    type === 'boolean')
        })
    )
}

export async function sendToAnalytics(request: Request, name: string, metadata: { error?: any, errorType?: any, errorCode?: any, statusCode?: number, model?: string, referrer?: any } & Record<string, any>) {
    try {
        if (!request || !name) {
            logAnalytics('Analytics skipped: Missing required parameters', { request: !!request, name })
            return
        }

        if (!measurementId || !apiSecret) {
            logAnalytics('Analytics skipped: Missing credentials', { hasMeasurementId: !!measurementId, hasApiSecret: !!apiSecret })
            return
        }

        const referrer = metadata?.referrer ?? request.headers?.referrer ?? request.body?.referrer ?? request.headers?.referer ?? request.query?.referrer
        const userAgent = request.headers?.['user-agent']
        const language = request.headers?.['accept-language']
        // TODO: Request.connection is deprecated
        const clientIP = request.headers?.['x-real-ip'] ?? request.headers?.['x-forwarded-for'] ?? request?.connection?.remoteAddress
        const queryParams = request.query ?? {}
        
        // Match the exact structure of the working image API
        const analyticsData = {
            endpoint: `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}`,
            eventName: name,
            metadata: filterSimpleValues({
                ...queryParams,
                ...metadata,
                referrer,
                ip: clientIP,
                method: request.method,
                path: request.path,
                originalUrl: request.originalUrl,
                protocol: request.protocol,
                host: request.get('host'),
                timestamp: new Date().toISOString()
            }),
            headers: filterSimpleValues({
                referrer,
                userAgent: userAgent?.substring(0, 50),
                language,
                clientIP
            }),
            queryParams: filterSimpleValues(queryParams)
        }

        logAnalytics('Sending analytics data:', analyticsData)

        // Send the actual analytics data in GA4 format
        const response = await fetch(`${analyticsData.endpoint}&api_secret=${apiSecret}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: analyticsData.headers.clientIP || 'unknown',
                events: [{
                    name: analyticsData.eventName,
                    params: analyticsData.metadata
                }]
            })
        })

        const responseText = await response.text()
        logAnalytics('Analytics response:', {
            status: response.status,
            statusText: response.statusText,
            body: responseText || '(empty response)',
            headers: Object.fromEntries(response.headers)
        })

        return responseText
    } catch (error: any) {
        logError('Error sending analytics:', {
            error: error.message,
            stack: error.stack,
            name,
            metadata
        })
        return
    }
}
