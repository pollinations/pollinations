/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_OPENAI_API_KEY: string;
    readonly VITE_POLLINATIONS_AI_TOKEN: string;
    readonly POLLINATIONS_API_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
