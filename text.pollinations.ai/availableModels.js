export const availableModels = [
    {
        name: 'openai',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o-mini',
        baseModel: true,
        vision: true
    },
    {
        name: 'openai-large',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o',
        baseModel: true,
        vision: true
    },
    {
        name: 'openai-reasoning',
        type: 'chat',
        censored: true,
        description: 'OpenAI o1-mini',
        baseModel: true,
        reasoning: true
    },
    // {
    //     name: 'qwen',
    //     type: 'chat',
    //     censored: true,
    //     description: 'Qwen 2.5 72B',
    //     baseModel: true,
    // },
    {
        name: 'qwen-coder',
        type: 'chat',
        censored: true,
        description: 'Qwen 2.5 Coder 32B',
        baseModel: true,
    },
    {
        name: 'llama',
        type: 'chat',
        censored: false,
        description: 'Llama 3.3 70B',
        baseModel: true,
    },
    {
        name: 'mistral',
        type: 'chat',
        censored: false,
        description: 'Mistral Nemo',
        baseModel: true,
    },
    // {
    //     name: 'mistral-large',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Mistral Large (v2)',
    //     baseModel: true,
    // },
    // {
    //     name: 'llama',
    //     type: 'completion',
    //     censored: true,
    //     description: 'Llama 3.1',
    //     baseModel: true,
    // },
    // {
    //     name: 'karma',
    //     type: 'completion',
    //     censored: true,
    //     description: 'Karma.yt Zeitgeist. Connected to realtime news and the web. (beta)',
    //     baseModel: false,
    // },
    // {
    //     name: 'command-r',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Command-R',
    //     baseModel: false,
    // },
    {
        name: 'unity',
        type: 'chat',
        censored: false,
        description: 'Unity with Mistral Large by Unity AI Lab',
        baseModel: false,
    },
    {
        name: 'midijourney',
        type: 'chat',
        censored: true,
        description: 'Midijourney musical transformer',
        baseModel: false,
    },
    {
        name: 'rtist',
        type: 'chat',
        censored: true,
        description: 'Rtist image generator by @bqrio',
        baseModel: false,
    },
    {
        name: 'searchgpt',
        type: 'chat',
        censored: true,
        description: 'SearchGPT with realtime news and web search',
        baseModel: false,
    },
    // { name: 'claude', type: 'chat', censored: true }
    // { name: 'sur', type: 'chat', censored: true }
    {
        name: 'evil',
        type: 'chat',
        censored: false,
        description: 'Evil Mode - Experimental',
        baseModel: false,
    },
    // {
    //     name: 'p1',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Pollinations 1 (OptiLLM)',
    //     baseModel: false,
    // },
    {
        name: 'deepseek',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-V3',
        baseModel: true,
    },
    {
        name: 'claude-hybridspace',
        type: 'chat',
        censored: true,
        description: 'Claude Hybridspace',
        baseModel: true,
    },
    {
        name: 'deepseek-r1',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-R1 Distill Qwen 32B',
        baseModel: true,
        reasoning: true,
        provider: 'cloudflare'
    },
    {
        name: 'deepseek-reasoner',
        type: 'chat',
        censored: true,
        description: 'DeepSeek R1 - Full',
        baseModel: true,
        reasoning: true,
        provider: 'deepseek'
    },
    // {
    //     name: 'llamalight',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Llama 3.2 3B Instruct',
    //     baseModel: true,
    // },
    {
        name: 'llamalight',
        type: 'chat',
        censored: false,
        description: 'Llama 3.1 8B Instruct',
        baseModel: true,
    },
    // {
    //     name: 'mistral-large',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Mistral Large (v2)',
    //     baseModel: true,
    // },
    {
        name: 'llamaguard',
        type: 'safety',
        censored: false,
        description: 'Llamaguard 7B AWQ',
        baseModel: false,
        provider: 'cloudflare'
    },
    {
        name: 'gemini',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash',
        baseModel: true,
        provider: 'google'
    },
    {
        name: 'gemini-thinking',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash Thinking',
        baseModel: true,
        provider: 'google'
    },
    // {
    //     name: 'llama',
    //     type: 'chat',
    //     censored: false,
    //     description: 'Llama 3.3 70B',
    //     baseModel: true,
    // },
    {
        name: 'hormoz',
        type: 'chat',
        description: 'Hormoz 8b by Muhammadreza Haghiri',
        baseModel: false,
        provider: 'modal.com',
        censored: false
    },
    {
        name: 'hypnosis-tracy',
        type: 'chat',
        description: 'Hypnosis Tracy - Your Self-Help AI',
        baseModel: false,
        provider: 'modal.com',
        censored: false
    }
];
