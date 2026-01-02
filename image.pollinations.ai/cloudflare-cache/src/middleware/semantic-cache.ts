import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
    createEmbeddingService,
    variableThreshold,
} from "../embedding-service.ts";
import {
    createSimpleHash,
    dedent,
    extractPromptFromUrl,
    setHttpMetadataHeaders,
} from "../util.ts";
import { buildMetadata, createVectorizeStore } from "../vector-store.ts";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        cacheKey: string;
    };
};

export const semanticCache = createMiddleware<Env>(async (c, next) => {
    // @ts-ignore
    // ignoring this type error because cf-typegen outputs
    // true as the type instead of boolean, but it will change
    // if we change the var in wrangler.toml
    if (c.req.header("no-cache") || c.env.SEMANTIC_CACHE_ENABLED === false) {
        return next();
    }

    const embeddingService = createEmbeddingService(c.env.AI);
    const vectorStore = createVectorizeStore(c.env.VECTORIZE_INDEX);

    const prompt = extractPromptFromUrl(new URL(c.req.url)) || "";

    const embedding = await embeddingService(prompt);
    if (embedding === null) {
        // skip if embedding failed
        console.error("[SEMANTIC] Embedding generation failed");
        return next();
    }

    // get the cache key (set by exact cache)
    const cacheKey = c.get("cacheKey");
    if (cacheKey === undefined || cacheKey === null) {
        // skip if there is no cache key
        console.error(dedent`
            [SEMANTIC] Cache key not found: skipping semantic cache
            This is likely caused by the exact cache being disabled 
            or not working correctly.
        `);
        return next();
    }

    const imageParams = c.get("imageParams");
    const metadata = buildMetadata(cacheKey, imageParams);

    try {
        const nearest = await vectorStore.findNearest(
            embedding,
            metadata.bucket,
        );
        const nearestSimilarity = nearest[0]?.score;
        const nearestCacheKey = nearest[0]?.metadata?.cacheKey?.toString();
        const threshold = variableThreshold(
            prompt.length,
            c.env.SEMANTIC_THRESHOLD_SHORT,
            c.env.SEMANTIC_THRESHOLD_LONG,
        );

        const incomingPrompt = prompt;
        const nearestPromptReconstructed = promptFromCacheKey(nearestCacheKey);

        console.log("[SEMANTIC] Evaluating:", {
            incomingPrompt,
            nearestPromptReconstructed,
            nearestCacheKey,
            similarity: nearestSimilarity,
            variableThreshold: threshold,
            hit: nearestSimilarity >= threshold,
        });

        if (nearestSimilarity >= threshold) {
            if (!nearestCacheKey) {
                console.error(
                    "[SEMANTIC] Nearest entry found, but it had no cache key",
                );
                return next();
            }

            console.debug("[SEMANTIC] Cache hit");
            const cachedImage = await c.env.IMAGE_BUCKET.get(nearestCacheKey);
            if (cachedImage) {
                setHttpMetadataHeaders(c, cachedImage.httpMetadata);
                addSemanticCacheHeaders(c, {
                    status: "HIT",
                    nearestSimilarity,
                    bucket: metadata.bucket,
                });

                return c.body(cachedImage.body);
            } else {
                console.error(dedent`
                    [SEMANTIC] Cached image not found
                    There was a similarity match, but the image was not
                    found in R2, which likely means the vector store is 
                    out of sync with R2.
                `);
            }
        } else {
            console.debug("[SEMANTIC] No semantic matches found");
        }

        console.log("[SEMANTIC] Cache miss");
        addSemanticCacheHeaders(c, {
            status: "MISS",
            nearestSimilarity,
            bucket: metadata.bucket,
        });
    } catch (error) {
        console.error("[SEMANTIC] Error retrieving cached image:", error);
    }

    await next();

    // Skip storing if response has X-Error-Type header (error images should not be cached)
    if (c.res?.ok && !c.res.headers.get("x-error-type")) {
        // Store the embedding with a link to the generated image
        c.executionCtx.waitUntil(
            (async () => {
                console.debug("[SEMANTIC] Storing embedding in vector store");
                const vectorId = await createSimpleHash(cacheKey);
                const result = await vectorStore.storeEmbedding(
                    vectorId,
                    embedding,
                    metadata,
                );
                console.debug(
                    "[SEMANTIC] Stored embedding successfully:",
                    result,
                );
            })(),
        );
    } else if (c.res.headers.get("x-error-type")) {
        console.debug("[SEMANTIC] Skipping cache for error image:", c.res.headers.get("x-error-type"));
    } else {
        console.error("[SEMANTIC] Error: request was not OK");
    }
});

type SemanticCacheResult = {
    status: "HIT" | "MISS";
    nearestSimilarity: number;
    bucket: string;
};

function addSemanticCacheHeaders(c: Context, result: SemanticCacheResult) {
    c.header("X-Cache", result.status);
    if (result.status === "HIT") c.header("X-Cache-Type", "SEMANTIC");
    c.header("X-Semantic-Similarity", `${result.nearestSimilarity}`);
    c.header("X-Semantic-Bucket", result.bucket);
}

function promptFromCacheKey(cacheKey?: string): string {
    if (!cacheKey) return "";
    const withoutPromptPrefix = cacheKey.replace(/^_prompt_/, "");
    const withoutSuffix = withoutPromptPrefix.replace(/-[0-9a-f]+$/i, "");
    const withoutQueryParams = withoutSuffix.replace(
        /(_[a-zA-Z]+_[a-zA-Z0-9-]+)+$/,
        "",
    );
    return decodeURIComponent(withoutQueryParams);
}
