interface ModelCounts {
    [model: string]: number;
}

const counts: ModelCounts = {};

// Increment counter for a model (in-memory only)
export function incrementModelCounter(model: string): void {
    counts[model] = (counts[model] || 0) + 1;
}

// Get current model counts
export function getModelCounts(): ModelCounts {
    return { ...counts };
}
