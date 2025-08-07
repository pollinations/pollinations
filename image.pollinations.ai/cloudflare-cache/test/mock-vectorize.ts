import { cosineSimilarity } from "./util.ts";

// Our in-memory mock that behaves like a real VectorizeIndex
export function createMockVectorize(): Vectorize {
    let storedVectors: VectorizeVector[] = [];

    async function query(
        vector: number[],
        options: VectorizeQueryOptions,
    ): Promise<VectorizeMatches> {
        const topK = options?.topK ?? 10;

        const scoredVectors = storedVectors
            .map((storedVector) => ({
                ...storedVector,
                score: cosineSimilarity(vector, [...storedVector.values]),
            }))
            .filter((scoredVector) => {
                if (!options?.filter) return true;
                return Object.entries(options?.filter).every(([key, value]) => {
                    if (typeof value !== "object") return true;
                    return scoredVector.metadata?.[key] === value.$eq;
                });
            })
            .sort((a, b) => b.score - a.score);

        const matches = scoredVectors.slice(0, topK).map((v) => ({
            id: v.id,
            score: v.score,
            metadata: v.metadata,
            values: v.values,
        }));

        console.log("[QUERY] Matches:", debugMatches(matches));
        return { matches, count: matches.length };
    }

    async function insert(
        vectors: VectorizeVector[],
    ): Promise<VectorizeAsyncMutation> {
        for (const vector of vectors) {
            if (storedVectors.some((v) => v.id === vector.id)) {
                throw new Error(`Vector with ID ${vector.id} already exists.`);
            }
            storedVectors.push({ ...vector });
        }
        console.log("[INSERT] Vectors:", debugVectors(storedVectors));
        return { mutationId: `insert-${Date.now().toString()}` };
    }

    async function upsert(
        vectors: VectorizeVector[],
    ): Promise<VectorizeAsyncMutation> {
        for (const vector of vectors) {
            const index = storedVectors.findIndex((v) => v.id === vector.id);
            if (index !== -1) {
                storedVectors[index] = { ...vector }; // Update existing
            } else {
                storedVectors.push({ ...vector }); // Insert new
            }
        }
        console.log("[UPSERT] Vectors:", debugVectors(storedVectors));
        return { mutationId: `upsert-${Date.now().toString()}` };
    }

    async function deleteByIds(ids: string[]): Promise<VectorizeAsyncMutation> {
        storedVectors = storedVectors.filter((v) => !ids.includes(v.id));
        console.log("[DELETE BY IDS] Vectors:", debugVectors(storedVectors));
        return { mutationId: `deleteByIds-${Date.now().toString()}` };
    }

    async function getByIds(ids: string[]): Promise<VectorizeVector[]> {
        return storedVectors.filter((v) => ids.includes(v.id));
    }

    function describe(): Promise<VectorizeIndexInfo> {
        throw new Error("Method not implemented.");
    }

    function queryById(
        _vectorId: string,
        _options?: VectorizeQueryOptions,
    ): Promise<VectorizeMatches> {
        throw new Error("Method not implemented.");
    }

    return {
        query,
        insert,
        upsert,
        deleteByIds,
        getByIds,
        describe,
        queryById,
    };
}

function debugMatches(vectors: VectorizeMatch[]) {
    return vectors.map(({ id, score, metadata }) => ({
        id,
        score,
        cacheKey: metadata.cacheKey,
    }));
}

function debugVectors(vectors: VectorizeVector[]) {
    return vectors.map(({ id, metadata }) => ({
        id,
        cacheKey: metadata.cacheKey,
    }));
}
