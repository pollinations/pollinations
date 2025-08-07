import { cosineSimilarity } from "./util.ts";

// Our in-memory mock that behaves like a real VectorizeIndex
export class MockVectorize implements Vectorize {
    // Store vectors in a simple array
    private vectors: VectorizeVector[] = [];

    async query(
        vector: number[],
        options: VectorizeQueryOptions,
    ): Promise<VectorizeMatches> {
        const topK = options?.topK ?? 10;

        const scoredVectors = this.vectors
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
        return { matches, count: this.vectors.length };
    }

    async insert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation> {
        for (const vector of vectors) {
            if (this.vectors.some((v) => v.id === vector.id)) {
                throw new Error(`Vector with ID ${vector.id} already exists.`);
            }
            this.vectors.push({ ...vector });
        }
        console.log("[INSERT] Vectors:", debugVectors(this.vectors));
        return { mutationId: `insert-${Date.now().toString}` };
    }

    async upsert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation> {
        for (const vector of vectors) {
            const index = this.vectors.findIndex((v) => v.id === vector.id);
            if (index !== -1) {
                this.vectors[index] = { ...vector }; // Update existing
            } else {
                this.vectors.push({ ...vector }); // Insert new
            }
        }
        console.log("[UPSERT] Vectors:", debugVectors(this.vectors));
        return { mutationId: `upsert-${Date.now().toString}` };
    }

    async deleteByIds(ids: string[]): Promise<VectorizeAsyncMutation> {
        this.vectors = this.vectors.filter((v) => !ids.includes(v.id));
        return { mutationId: `deleteByIds-${Date.now().toString}` };
    }

    async getByIds(ids: string[]): Promise<VectorizeVector[]> {
        return this.vectors.filter((v) => ids.includes(v.id));
    }

    public describe(): Promise<VectorizeIndexInfo> {
        throw new Error("Method not implemented.");
    }

    public queryById(
        _vectorId: string,
        _options?: VectorizeQueryOptions,
    ): Promise<VectorizeMatches> {
        throw new Error("Method not implemented.");
    }
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
