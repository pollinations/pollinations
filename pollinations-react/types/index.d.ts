declare module "@pollinations/react" {
    export interface Message {
        role: "system" | "user" | "assistant";
        content: string;
    }

    export interface Model {
        id?: string;
        name?: string;
        [key: string]: any;
    }

    export interface TextOptions {
        seed?: number;
        model?: string;
        system?: string;
        json?: boolean;
        temperature?: number;
        stream?: boolean;
        private?: boolean;
        apiKey: string;
    }

    export interface ImageOptions {
        width?: number;
        height?: number;
        seed?: number;
        model?: string;
        nologo?: boolean;
        enhance?: boolean;
        apiKey: string;
    }

    export interface ChatOptions {
        seed?: number;
        model?: string;
        json?: boolean;
        apiKey: string;
    }

    export interface ModelsOptions {
        apiKey?: string;
    }

    export function usePollinationsText(
        prompt: string | null,
        options?: TextOptions,
    ): {
        data: string | object | null;
        isLoading: boolean;
        error: string | null;
    };

    export function usePollinationsImage(
        prompt: string,
        options?: ImageOptions,
    ): {
        data: string | null;
        isLoading: boolean;
        error: string | null;
    };

    export function usePollinationsChat(
        initialMessages?: Message[],
        options?: ChatOptions,
    ): {
        sendMessage: (message: string) => void;
        sendUserMessage: (message: string) => void;
        messages: Message[];
        isLoading: boolean;
        error: string | null;
        reset: () => void;
    };

    export function usePollinationsModels(
        type?: "text" | "image",
        options?: ModelsOptions,
    ): {
        models: Model[];
        isLoading: boolean;
        error: string | null;
    };
}
