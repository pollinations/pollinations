export const availableModels = [
    {
        name: 'openai',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o',
        baseModel: true,
    },
    {
        name: 'mistral',
        type: 'chat',
        censored: false,
        description: 'Mistral Nemo',
        baseModel: true,
    },
    {
        name: 'mistral-large',
        type: 'chat',
        censored: false,
        description: 'Mistral Large (v2)',
        baseModel: true,
    },
    {
        name: 'llama',
        type: 'completion',
        censored: true,
        description: 'Llama 3.1',
        baseModel: true,
    },
    // {
    //     name: 'karma',
    //     type: 'completion',
    //     censored: true,
    //     description: 'Karma.yt Zeitgeist. Connected to realtime news and the web. (beta)',
    //     baseModel: false,
    // },
    {
        name: 'command-r',
        type: 'chat',
        censored: false,
        description: 'Command-R',
        baseModel: false,
    },
    {
        name: 'unity',
        type: 'chat',
        censored: false,
        description: 'Unity with Mistral Large by @gfourteen',
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
    }
    // { name: 'claude', type: 'chat', censored: true }
    // { name: 'sur', type: 'chat', censored: true }
];
