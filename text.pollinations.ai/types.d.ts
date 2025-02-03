interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'function'
    content: string | null
}

type Conversation = ChatMessage[]

interface TextRequestData {
    messages?: Conversation
    jsonMode?: boolean
    seed?: number
    model?: string
    temperature?: number
    isImagePollinationsReferrer?: boolean
    isRobloxReferrer?: boolean
    referrer?: string
    stream?: boolean
    plainTextResponse?: boolean

    private?: boolean

    // TODO: Figure out the types of tools
    tools?: any[]
    tool_choice?: any
}

type CompletionResponse = {
    stream: ReadableStream<string>
    choices?: {
        content_filter_result?: unknown,
        content_filter_results?: unknown,
        finish_reason: 'stop',
        index: number,
        logprobs?: unknown,
        message: ChatMessage
    }[],
    created?: number,
    id?: string,
    model?: string,
    object?: 'chat.completion',
    usage?: unknown,
    error?: unknown
}

type streamHandler = (messages: Conversation, options: TextRequestData) => CompletionResponse