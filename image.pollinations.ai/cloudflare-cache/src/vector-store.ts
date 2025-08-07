import { getResolutionBucket } from "./embedding-service.ts";

export type VectorStoreMatch<TMetadata> = {
    id: string;
    score: number;
    metadata: TMetadata;
};

export interface VectorStore<TMetadata> {
    storeEmbedding: (
        id: string,
        vector: number[],
        metadata: TMetadata,
    ) => Promise<boolean>;
    findNearest: (
        vector: number[],
        bucket: string,
    ) => Promise<VectorStoreMatch<TMetadata>[]>;
}

export type VectorMetadata = {
    cacheKey: string;
    bucket: string;
    model: string;
    nologo: boolean;
    width: number;
    height: number;
    cachedAt: number;
    image?: string;
    seed?: number;
};

type MetadataValue = string | number | boolean;

export function createVectorizeStore<
    TMetadata extends Record<string, MetadataValue>,
>(vectorize: Vectorize): VectorStore<TMetadata> {
    const storeEmbedding = async (
        id: string,
        vector: number[],
        metadata: TMetadata,
    ): Promise<boolean> => {
        try {
            const item = {
                id,
                metadata,
                values: vector,
            };
            await vectorize.upsert([item]);
            return true;
        } catch (error) {
            console.error("[VECTORIZE] Failed to store embedding:", {
                message: error.message,
                stack: error.stack,
                name: error.name,
            });
            return false;
        }
    };

    const findNearest = async (
        vector: number[],
        bucket: string,
        topK: number = 1,
    ): Promise<VectorStoreMatch<TMetadata>[]> => {
        try {
            const results = await vectorize.query(vector, {
                topK,
                returnValues: false,
                returnMetadata: "all",
                filter: {
                    bucket: { $eq: bucket },
                },
            });
            return results.matches.map((match) => ({
                id: match.id,
                score: match.score,
                metadata: match.metadata as TMetadata,
            }));
        } catch (error) {
            console.error(
                "[VECTORIZE] Failed to find nearest embedding:",
                error,
            );
            return [];
        }
    };

    return {
        storeEmbedding,
        findNearest,
    };
}

export function buildMetadata(cacheKey: string, url: URL): VectorMetadata {
    const width = parseInt(url.searchParams.get("width")) || 1024;
    const height = parseInt(url.searchParams.get("height")) || 1024;
    const seed = parseInt(url.searchParams.get("seed")) || null;
    const model = url.searchParams.get("model") || "flux";
    const nologo = url.searchParams.get("nologo") === "true";
    const image = url.searchParams.get("image");
    const bucket = getResolutionBucket(width, height, seed, nologo, image);

    return {
        cacheKey,
        width,
        height,
        model,
        cachedAt: Date.now(),
        seed,
        nologo,
        bucket,
        ...(image ? { image: image.substring(0, 8) } : {}),
        ...(seed ? { seed } : {}),
    };
}
