/**
 * Calculates the cosine similarity between two vectors (arrays of numbers).
 * The result is a value between -1 and 1.
 * -  1 means the vectors are identical in orientation.
 * -  0 means the vectors are orthogonal (unrelated).
 * - -1 means the vectors are diametrically opposed.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error(
            "Vectors must be of the same length to calculate cosine similarity.",
        );
    }

    let dotProduct = 0.0;
    let magnitudeA = 0.0;
    let magnitudeB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        // If one or both vectors are the zero vector, their similarity is 0.
        // Cosine similarity is technically undefined in this case,
        // but returning 0 is a practical and common convention.
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}
