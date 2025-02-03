import axios from 'axios'
import dotenv from 'dotenv'
import debug from 'debug'

const log = debug('pollinations:claude')

dotenv.config()

const claudeEndpoint = 'https://api.anthropic.com/v1/messages'

async function generateTextClaude(messages: Conversation, options: TextRequestData) {
    const { jsonMode, seed } = options
    let temperature = options.temperature

    log('generateTextClaude called with messages: %O', messages)
    log('Options: %O', { jsonMode, seed, temperature })

    const { messages: processedMessages, systemMessage } = extractSystemMessage(messages, jsonMode ?? false)
    log('extracted system message: %s', systemMessage)
    log('processed messages: %O', processedMessages)

    const alternatingMessages = ensureAlternatingRoles(processedMessages)
    log('alternating messages: %O', alternatingMessages)

    // Ensure the first message is a user message
    if (alternatingMessages.length === 0 || alternatingMessages[0].role !== 'user') {
        alternatingMessages.unshift({ role: 'user', content: '-' })
    }

    try {
        const convertedMessages = await convertToClaudeFormat(alternatingMessages)
        log('converted messages: %O', convertedMessages)

        // Ensure temperature is a valid number between 0 and 1
        if (typeof temperature !== 'number' || temperature < 0 || temperature > 1) {
            temperature = 0.5
        }

        const response = await axios.post(claudeEndpoint, {
            // model: 'claude-3-5-sonnet-20241022',
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 8190,
            messages: convertedMessages,
            system: systemMessage,
            temperature: temperature,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        })

        log('Claude API response: %O', response.data)
        return response.data.content[0]?.text
    } catch (error: any) {
        log('Error calling Claude API: %s', error.message)

        if (error.response && error.response.data && error.response.data.error) log('Error details: %s', error.response.data.error)

        throw error
    }
}

function extractSystemMessage(messages: Conversation, jsonMode: boolean) {
    log('extractSystemMessage called with messages: %O', messages)

    let systemMessage = undefined

    messages = messages.map(message => {
        if (message.role === 'system') systemMessage = message.content
        else return message
    }).filter(message => !!message)

    if (jsonMode && !systemMessage) systemMessage = 'Respond in simple JSON format'

    log('extracted system message: %s', systemMessage)
    log('filtered messages: %O', messages)

    return {
        messages,
        systemMessage: systemMessage
    }
}

function ensureAlternatingRoles(messages: Conversation) {
    log('ensureAlternatingRoles called with messages: %O', messages)
    const alternatingMessages: Conversation = []
    let lastRole: string = ''

    messages.forEach(message => {
        if (lastRole === message.role) {
            const alternateRole = lastRole === 'user' ? 'assistant' : 'user'
            alternatingMessages.push({ role: alternateRole, content: '-' })
        }

        alternatingMessages.push(message)
        lastRole = message.role
    })

    log('ensured alternating messages: %O', alternatingMessages)
    return alternatingMessages
}

async function convertToClaudeFormat(messages: Conversation) {
    log('convertToClaudeFormat called with messages: %O', messages)
    return Promise.all(messages.map(async message => {
        if (Array.isArray(message.content)) {
            const convertedContent = await Promise.all(message.content.map(async item => {
                if (item.type === 'text') {
                    return {
                        type: 'text',
                        text: item?.text || '-'
                    }
                } else if (item.type === 'image_url') {
                    const imageUrl = item.image_url.url
                    if (imageUrl.startsWith('data:image/')) {
                        // Handle base64 image
                        const [mediaType, base64Data] = imageUrl.split(',')
                        return {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType.split(':')[1].split('')[0],
                                data: base64Data,
                            }
                        }
                    } else {
                        // Handle URL image
                        try {
                            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' })
                            const base64Data = Buffer.from(response.data, 'binary').toString('base64')
                            const mediaType = response.headers['content-type']
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mediaType,
                                    data: base64Data,
                                }
                            }
                        } catch (error) {
                            log('Error fetching image: %s', error)
                            throw new Error('Failed to fetch and convert image to base64')
                        }
                    }
                }
            }))
            log('converted content: %O', convertedContent)
            return {
                role: message.role,
                content: convertedContent
            }
        } else {
            return {
                ...message,
                content: message.content || '-'
            }
        }
    }))
}

export default generateTextClaude