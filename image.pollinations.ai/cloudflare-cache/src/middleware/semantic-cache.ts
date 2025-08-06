import { createMiddleware } from "hono/factory";
import { createEmbeddingService } from "~/embedding-service.ts";
import type { Env } from "~/env.ts";
import {
    createSimpleHash,
    dedent,
    extractPromptFromUrl,
    setHttpMetadataHeaders,
} from "~/util.ts";
import { buildMetadata, createVectorizeStore } from "~/vector-store.ts";

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

    const prompt = extractPromptFromUrl(new URL(c.req.url));

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

    const metadata = buildMetadata(cacheKey, new URL(c.req.url));

    try {
        const nearest = await vectorStore.findNearest(
            embedding,
            metadata.bucket,
        );
        const nearestSimilarity = nearest[0]?.score;

        const nearestCacheKey = nearest[0]?.metadata?.cacheKey?.toString();
        if (nearestCacheKey == null) {
            console.error(
                "[SEMANTIC] Nearest entry found, but it had no cache key",
            );
            return next();
        }

        console.debug("[SEMANTIC] Nearest entry:", {
            cacheKey: nearestCacheKey,
            similarity: nearestSimilarity,
        });

        if (nearestSimilarity >= c.env.SEMANTIC_THRESHOLD) {
            console.debug("[SEMANTIC] Cache hit");
            const cachedImage = await c.env.IMAGE_BUCKET.get(nearestCacheKey);
            if (cachedImage) {
                setHttpMetadataHeaders(c, cachedImage.httpMetadata);
                c.header(
                    "Cache-Control",
                    "public, max-age=31536000, immutable",
                );
                c.header("X-Cache", "HIT");
                c.header("X-Cache-Semantic", "HIT");
                c.header("X-Semantic-Similarity", `${nearestSimilarity}`);
                c.header("X-Semantic-Bucket", metadata.bucket);
                c.header("X-Semantic-Threshold", `${c.env.SEMANTIC_THRESHOLD}`);

                return c.body(cachedImage.body);
            } else {
                console.error(dedent`
                    [SEMANTIC] Cached image not found
                    There was a similarity match, but the image was not
                    found in R2, which likely means the vector store is 
                    out of sync with R2.
                `);
                c.header("X-Cache-Semantic", "MISS");
                c.header("X-Sematic-Similarity", `${nearestSimilarity}`);
                c.header("X-Semantic-Bucket", metadata.bucket);
                c.header("X-Semantic-Threshold", `${c.env.SEMANTIC_THRESHOLD}`);
                return next();
            }
        }
        console.debug("[SEMANTIC] No semantic matches found");
    } catch (error) {
        console.error("[SEMANTIC] Error retrieving cached image:", error);
    }

    // No match found, continue handling the request and store the embedding
    // in the vectorStore on the way out if it was successful.
    console.debug("[SEMANTIC] Cache miss");
    await next();

    if (c.res?.ok) {
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
    } else {
        console.error("[SEMANTIC] Error: request was not OK");
    }
    return null;
});
