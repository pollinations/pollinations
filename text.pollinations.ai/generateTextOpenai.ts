import { AzureOpenAI } from 'openai'
import dotenv from 'dotenv'
import debug from 'debug'
import { spamTheSpammersPrompt } from './pollinationsPrompt'
import { searchToolDefinition, performWebSearch } from './tools/searchTool'
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool'
import { hasSystemMessage } from './generatorImports'

const errorLog = debug('pollinations:openai:error')

dotenv.config()

const azureInstances: Record<string, AzureOpenAI> = {
    'gpt-4o-mini': new AzureOpenAI({
        apiVersion: process.env.AZURE_OPENAI_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    }),
    'gpt-4o': new AzureOpenAI({
        apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_LARGE_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
    })
}

function countMessageCharacters(messages: Conversation) {
    return messages.reduce((total, message) => {
        if (typeof message.content === 'string') return total + message.content.length

        if (Array.isArray(message.content)) {
            return total + (message.content as any).reduce((sum: number, part: any) => {
                if (part.type === 'text') return sum + part.text.length
                return sum
            }, 0)
        }

        return total
    }, 0)
}

export async function generateText(messages: Conversation, options: TextRequestData, performSearch = false) {
    const MAX_CHARS = 256000
    const totalChars = countMessageCharacters(messages)
    
    if (totalChars > MAX_CHARS) {
        errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars)
        throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`)
    }

    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : performSearch ? 'You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information.' : spamTheSpammersPrompt()
            
        messages = [{ role: 'system', content: systemContent }, ...messages]
    } else if (options.jsonMode) {
        const systemMessage = messages.find(m => m.role === 'system')
        if (systemMessage && !containsJSON(systemMessage.content)) systemMessage.content += ' Respond with JSON.'
    }

    const modelName = options.model === 'openai-large' ? 'gpt-4o' : 'gpt-4o-mini'
    const azureInstance = azureInstances[modelName]
    
    let completion = await azureInstance.chat.completions.create({
        model: modelName,
        messages: messages as any[],
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools: (performSearch ? [searchToolDefinition, scrapeToolDefinition] : undefined) as any,
        tool_choice: performSearch ? 'auto' : undefined,
        temperature: options.temperature,
    })

    let responseMessage = completion.choices[0].message

    while (responseMessage.tool_calls) {
        const toolCalls = responseMessage.tool_calls
        messages.push({
            role: responseMessage.role,
            content: responseMessage.content ?? ''
        })

        for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'web_search') {
                const args = JSON.parse(toolCall.function.arguments)
                const searchResponse = await performWebSearch(args)
                
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: searchResponse
                })
            } else if (toolCall.function.name === 'web_scrape') {
                const args = JSON.parse(toolCall.function.arguments)
                const scrapeResponse = await performWebScrape(args)
                
                messages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: toolCall.function.name,
                    content: scrapeResponse
                })
            }
        }

        completion = await azureInstance.chat.completions.create({
            model: modelName,
            messages: messages as any[],
            seed: options.seed,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            tools: [searchToolDefinition, scrapeToolDefinition] as any[],
            tool_choice: 'auto',
            max_tokens: 4096,
        })

        responseMessage = completion.choices[0].message
    }
    
    return completion
}

function containsJSON(text: string) {
    return text.toLowerCase().includes('json')
}
