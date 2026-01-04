import { promises as fs } from "node:fs";
import { join } from "node:path";

const COUNTER_FILE = join(process.cwd(), "model-requests.json");

interface ModelCounts {
    [model: string]: number;
}

let counts: ModelCounts = {};
let initialized = false;

// Load counts from file
async function loadCounts(): Promise<void> {
    try {
        const data = await fs.readFile(COUNTER_FILE, "utf-8");
        counts = JSON.parse(data);
    } catch {
        counts = {};
    }
    initialized = true;
}

// Save counts to file
async function saveCounts(): Promise<void> {
    await fs.writeFile(COUNTER_FILE, JSON.stringify(counts, null, 2));
}

// Increment counter for a model
export async function incrementModelCounter(model: string): Promise<void> {
    if (!initialized) await loadCounts();

    counts[model] = (counts[model] || 0) + 1;
    await saveCounts();
}

// Get current model counts
export async function getModelCounts(): Promise<ModelCounts> {
    if (!initialized) await loadCounts();
    return { ...counts };
}
