#!/usr/bin/env node

import * as EventSource from 'eventsource'
import debug from 'debug'

const log = debug('pollinations:filter')
debug.enable('pollinations:filter')

// Helper functions for content detection
const hasMarkdown = (text: string) => {
    return [
        /#{1,6}\s+.+/,      // Headers
        /\[.+\]\(.+\)/,     // Links
        /\*\*.+\*\*/,       // Bold
        /`.+`/,             // Code
        /^\s*[-*+]\s+/m,    // Lists
        /^\s*\d+\.\s+/m     // Numbered lists
    ].some(pattern => pattern.test(text))
}

const hasHtml = (text: string) => /<[^>]+>/i.test(text)

// Helper function to truncate text
const truncate = (text: string, maxLength = 300) => !text ? '' : text.length > maxLength ? text.slice(0, maxLength) + '...' : text

// Helper function to convert messages to markdown
const messagesToMarkdown = (messages: Conversation) => {
    if (!Array.isArray(messages)) return ''
    return messages.map(msg => 
        `**${msg.role}**:\n\n${truncate(msg.content)}\n`
    ).join('\n---\n\n')
}

// Filter function that checks if a message matches the criteria
const matchesFilters = (data: any, options: Record<string, any> = {}) => {
    const { response, parameters } = data
    const referrer = parameters?.referrer

    if (options.noRoblox && referrer && referrer.toLowerCase().includes('roblox')) return false

    if (options.referrer !== undefined) {
        if (options.referrer === false && referrer) return false
        if (options.referrer instanceof RegExp && (!referrer || !options.referrer.test(referrer))) return false
        if (typeof options.referrer === 'string' && referrer !== options.referrer) return false
    }

    // Check for markdown OR html if either option is specified
    if (options.hasMarkdown !== undefined || options.hasHtml !== undefined) {
        const hasMarkdownMatch = options.hasMarkdown === undefined || hasMarkdown(response) === options.hasMarkdown
        const hasHtmlMatch = options.hasHtml === undefined || hasHtml(response) === options.hasHtml
        if (!hasMarkdownMatch && !hasHtmlMatch) return false
    }

    return true
}

// Main function to start the feed listener
const startFeedListener = (options = {}, feedUrl = 'https://text.pollinations.ai/feed') => {
    const eventSource = new EventSource.EventSource(feedUrl)
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            if (matchesFilters(data, options)) {
                console.log('\n# Response\n')
                console.log(truncate(data.response))
                console.log('\n# Messages\n')
                console.log(messagesToMarkdown(data.parameters.messages))
                console.log('\n-------------------\n')
            }
        } catch (error) {
            log('Error processing message: %O', error)
        }
    }

    eventSource.onerror = (error) => {
        log('EventSource failed: %O', error)
    }

    log('Connected to feed with filters: %O', options)

    // Handle cleanup on process exit
    process.on('SIGINT', () => {
        eventSource.close()
        log('Disconnected from feed')
        process.exit(0)
    })
}

// Parse command line arguments
const parseArgs = () => {
    const args = process.argv.slice(2)
    const options: Record<string, any> = {}
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--no-referrer':
                options.referrer = false
                break
            case '--referrer':
                options.referrer = args[++i]
                break
            case '--has-markdown':
                options.hasMarkdown = true
                break
            case '--has-html':
                options.hasHtml = true
                break
            case '--no-roblox':
                options.noRoblox = true
                break
            case '--help':
                console.log(`
Usage: node feed-filter-cli.js [options]

Options:
  --no-referrer        Only show messages without a referrer
  --referrer <value>   Filter by specific referrer
  --has-markdown       Only show messages containing markdown
  --has-html          Only show messages containing HTML
  --no-roblox         Filter out messages with Roblox referrers
  --help              Show this help message
`)
                process.exit(0)
        }
    }
    return options
}

// Start the application
const options = parseArgs()
startFeedListener(options)
