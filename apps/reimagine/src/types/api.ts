export interface LexicaImage {
    id: string;
    promptid: string;
    width: number;
    height: number;
    upscaled_width: number | null;
    upscaled_height: number | null;
    userid: string;
    model_mode: string | null;
    raw_mode: boolean;
    variationForImageUrl: string | null;
    image_prompt_strength: number | null;
}

export interface LexicaPrompt {
    id: string;
    prompt: string;
    negativePrompt: string;
    timestamp: string;
    grid: boolean;
    seed: string;
    c: number;
    model: string;
    width: number;
    height: number;
    initImage: string | null;
    initImageStrength: number | null;
    is_private: boolean;
    cleanedPrompt: string | null;
    images: LexicaImage[];
}

export interface SearchResponse {
    prompts: LexicaPrompt[];
    nextCursor: number;
}

export interface SearchPayload {
    text: string;
    searchMode: "images" | "trending";
    source: "search" | "home";
    cursor: number;
    model?: string;
}
