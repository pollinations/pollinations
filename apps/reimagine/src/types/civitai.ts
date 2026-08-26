// Civitai API Type Definitions
export interface CivitaiImage {
    id: number;
    url: string;
    hash: string;
    width: number;
    height: number;
    nsfw: boolean;
    nsfwLevel: "None" | "Soft" | "Mature" | "X";
    createdAt: string;
    postId: number;
    stats: {
        cryCount: number;
        laughCount: number;
        likeCount: number;
        dislikeCount: number;
        heartCount: number;
        commentCount: number;
    };
    meta: {
        Size?: string;
        seed?: number;
        Model?: string;
        steps?: number;
        prompt?: string;
        sampler?: string;
        cfgScale?: number;
        "Clip skip"?: string;
        "Hires upscale"?: string;
        "Hires upscaler"?: string;
        negativePrompt?: string;
        "Denoising strength"?: string;
        [key: string]: any; // For additional dynamic metadata
    } | null;
    username: string;
}

export interface CivitaiImagesResponse {
    items: CivitaiImage[];
    metadata: {
        nextCursor?: number;
        currentPage?: number;
        pageSize?: number;
        nextPage?: string;
    };
}

// API Request Parameters
export interface CivitaiImagesParams {
    limit?: number;
    postId?: number;
    modelId?: number;
    modelVersionId?: number;
    username?: string;
    nsfw?: boolean | "None" | "Soft" | "Mature" | "X";
    sort?: "Most Reactions" | "Most Comments" | "Newest";
    period?: "AllTime" | "Year" | "Month" | "Week" | "Day";
    page?: number;
}

// UI Filter Types
export type TrendingSort = "Most Reactions" | "Most Comments" | "Newest";
export type TrendingPeriod = "AllTime" | "Year" | "Month" | "Week" | "Day";
export type NSFWFilter = "None" | "Soft" | "Mature" | "X" | "All";

export interface TrendingFilters {
    sort: TrendingSort;
    period: TrendingPeriod;
    nsfw: NSFWFilter;
    modelId?: number;
}
