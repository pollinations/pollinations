import * as EventSource from 'eventsource'
import debug from 'debug'

const log = debug('pollinations:monitor')

const FEED_URL = 'https://text.pollinations.ai/feed'
const modelStats = new Map()
const refererStats = new Map()
const ipStats = new Map()
let totalEntries = 0

// Parse command line arguments
const args = process.argv.slice(2)
const filters = {
    noReferrer: args.includes('--no-referrer'),
    referrer: args.find(arg => arg.startsWith('--referrer='))?.split('=')[1],
    hasMarkdown: args.includes('--markdown'),
    hasHtml: args.includes('--html'),
    model: args.find(arg => arg.startsWith('--model='))?.split('=')[1],
    showRaw: args.includes('--raw')
}

// Helper functions for content detection
function hasMarkdown(text: string) {
    const patterns = [
        /#{1,6}\s+.+/,      // Headers
        /\[.+\]\(.+\)/,     // Links
        /\*\*.+\*\*/,       // Bold
        /`.+`/,             // Code
        /^\s*[-*+]\s+/m,    // Lists
        /^\s*\d+\.\s+/m     // Numbered lists
    ]

    return patterns.some(pattern => pattern.test(text))
}

function hasHtml(text: string) {
    return /<[^>]+>/i.test(text)
}

// TODO: Fix type of `parameters`
function matchesFilters(data: { parameters: any, response: string }) {
    const { parameters, response } = data
    if (!parameters) return false

    const referer = parameters.referrer || 'undefined'
    const model = parameters.model || 'undefined'

    // Filter by referrer
    if (filters.noReferrer && referer !== 'undefined') return false
    if (filters.referrer) {
        if (filters.referrer.startsWith('/') && filters.referrer.endsWith('/')) {
            // Regex pattern
            const pattern = new RegExp(filters.referrer.slice(1, -1))
            if (!pattern.test(referer)) return false
        } else if (referer !== filters.referrer) {
            return false
        }
    }

    // Filter by model
    if (filters.model && model !== filters.model) return false

    // Filter by content type
    if (filters.hasMarkdown && !hasMarkdown(response)) return false
    if (filters.hasHtml && !hasHtml(response)) return false

    return true
}

function updateStats(eventData: string) {
    try {
        const data = JSON.parse(eventData)
        if (!matchesFilters(data)) return

        const { parameters, response, ip } = data
        if (!parameters) return
        
        const model = parameters.model ?? 'undefined'
        const referer = parameters.referrer ?? 'undefined'

        // Show raw message if requested
        if (filters.showRaw) {
            log('\nMatched message:')
            log('Model: %s', model)
            log('Referer: %s', referer)
            log('Response: %s', response)
            log('---')
            return
        }
        
        modelStats.set(model, (modelStats.get(model) ?? 0) + 1)
        refererStats.set(referer, (refererStats.get(referer) ?? 0) + 1)
        
        const ipKey = referer !== 'undefined' ? `${ip} (${referer.slice(0, 30)})` : ip
        ipStats.set(ipKey, (ipStats.get(ipKey) ?? 0) + 1)
        
        totalEntries++
        
        log('Last updated: %s', new Date().toLocaleTimeString())
        log('Total filtered entries: %d\n', totalEntries)
        
        // SUGGESTION: Move from the Array.from(X) syntax to the more elegant [...X] syntax

        // Models table
        log('Models:')
        const modelTable = Array.from(modelStats.entries()).map(([model, count]) => ({
            model,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }))
        log('%O', modelTable)
        
        // Referers table
        log('\nReferers:')
        const refererTable = Array.from(refererStats.entries()).map(([referer, count]) => ({
            referer,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }))
        log('%O', refererTable)

        // IP addresses table (top 10)
        log('\nTop 10 IP Addresses:')
        const ipTable = Array.from(ipStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ip, count]) => ({
                ip,
                count,
                percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
            }))
        log('%O', ipTable)
    } catch (error) {
        log('Error processing message: %O', error)
    }
}

// Show startup message with active filters
log('Starting monitor with filters:')
Object.entries(filters).forEach(([key, value]) => {
    if (value) log('- %s: %s', key, value)
})

// Connect to SSE feed
const eventSource = new EventSource.EventSource(FEED_URL)

eventSource.onmessage = (event) => updateStats(event.data)
eventSource.onerror = (error) => log('EventSource failed: %O', error)

log('\nConnecting to feed...')