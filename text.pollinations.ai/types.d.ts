interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool'
    tool_call_id?: string
    name?: string
    content: string | any
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
