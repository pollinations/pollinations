/**
 * Reusable LLM Signal Scoring Pipeline
 *
 * Shared module for LLM-based user scoring. Used by:
 * - detect-abuse.ts (abuse detection)
 * - score-for-upgrade.ts (tier upgrade legitimacy)
 *
 * Pattern: Fetch users from D1 -> chunk -> send to LLM with caller-provided prompt -> parse CSV response
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export interface User {
    email: string;
    github_username: string | null;
    created_at: number;
    tier: string;
}

export interface ScoredUser extends User {
    score: number;
    signals: string[];
}

export interface ScoringConfig {
    name: string;
    userQuery: string;
    buildPrompt: (csvRows: string[]) => string;
    chunkSize?: number;
    model?: string;
    parallelism?: number;
    singleChunk?: boolean;
    overlapSize?: number;
}

const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_OVERLAP = 20;

/**
 * Load API key from .testingtokens file
 */
export function loadApiKey(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        console.error("No .testingtokens file found");
        console.error(
            "Create one with: echo 'ENTER_API_TOKEN_REMOTE=pk_...' > .testingtokens",
        );
        process.exit(1);
    }

    const content = readFileSync(tokenFile, "utf-8");
    const match = content.match(/ENTER_API_TOKEN_REMOTE=([^\n]+)/);
    if (!match) {
        console.error("No ENTER_API_TOKEN_REMOTE found in .testingtokens");
        process.exit(1);
    }

    return match[1].trim();
}

/**
 * Fetch users from D1 database using provided SQL query
 */
export function fetchUsers(query: string): User[] {
    const sanitizedQuery = query.replace(/\n/g, " ");

    try {
        const result = execSync(
            `npx wrangler d1 execute DB --remote --env production --json --command "${sanitizedQuery}"`,
            { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );

        const data = JSON.parse(result);
        return data[0]?.results || [];
    } catch (error) {
        console.error("Failed to fetch users:", error);
        return [];
    }
}

/**
 * Format unix timestamp to human-readable string
 */
export function formatDate(timestamp: number): string {
    const d = new Date(Number(timestamp) * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Build chunk ranges with overlap for pattern detection
 */
export function buildChunkRanges(
    totalUsers: number,
    chunkSize: number,
    overlapSize: number,
    singleChunk: boolean,
): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const maxIterations = singleChunk ? 1 : totalUsers;

    for (let i = 0; i < maxIterations; i += chunkSize - overlapSize) {
        const end = Math.min(i + chunkSize, totalUsers);
        if (i >= totalUsers) break;
        ranges.push({ start: i, end });
    }

    return ranges;
}

/**
 * Prepare CSV data from a chunk of users
 */
export function prepareChunkData(chunk: User[]): {
    csvRows: string[];
    githubToIndex: Map<string, number>;
} {
    const githubToIndex = new Map<string, number>();

    const csvRows = chunk.map((user, idx) => {
        const github = user.github_username || `user_${idx}`;
        const humanDate = formatDate(user.created_at);
        const upgraded = user.tier !== "spore" && user.tier !== "microbe";

        githubToIndex.set(github, idx);
        return `${github},${user.email},${humanDate},${upgraded}`;
    });

    return { csvRows, githubToIndex };
}

/**
 * Parse LLM CSV response into scores
 */
export function parseLLMResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
): Array<{ score: number; signals: string[] }> {
    const results: Array<{ score: number; signals: string[] }> = new Array(
        chunkLength,
    )
        .fill(null)
        .map(() => ({ score: 0, signals: [] }));

    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
        if (line.startsWith("github,") || !line.includes(",")) continue;

        const parts = line.split(",");
        if (parts.length >= 2) {
            const github = parts[0]?.trim();
            const score = parseInt(parts[1], 10) || 0;
            const reason = parts[2]?.trim() || "";

            const idx = githubToIndex.get(github);
            if (idx !== undefined) {
                const signals =
                    reason === "ok" || reason === ""
                        ? []
                        : reason.split("+").filter((s) => s.trim());

                results[idx] = {
                    score: Math.min(100, Math.max(0, score)),
                    signals,
                };
            }
        }
    }

    return results;
}

/**
 * Call Pollinations API for scoring a single chunk
 */
async function callScoringAPI(
    chunk: User[],
    apiKey: string,
    modelName: string,
    buildPrompt: (csvRows: string[]) => string,
): Promise<Array<{ score: number; signals: string[] }>> {
    const { csvRows, githubToIndex } = prepareChunkData(chunk);
    const prompt = buildPrompt(csvRows);

    try {
        const response = await fetch(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                }),
            },
        );

        if (!response.ok) {
            console.error(`API error: ${response.status}`);
            return chunk.map(() => ({ score: 0, signals: [] }));
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        return parseLLMResponse(content, githubToIndex, chunk.length);
    } catch (error) {
        console.error("API call failed:", error);
        return chunk.map(() => ({ score: 0, signals: [] }));
    }
}

/**
 * Score users using the LLM pipeline
 *
 * Chunks users, sends each chunk to the LLM with the caller-provided prompt,
 * merges overlapping scores (takes highest), and returns scored users.
 */
export async function scoreUsers(config: ScoringConfig): Promise<ScoredUser[]> {
    const apiKey = loadApiKey();
    const chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const overlapSize = config.overlapSize ?? DEFAULT_OVERLAP;
    const modelName = config.model ?? "gemini";
    const parallelism = config.parallelism ?? 1;
    const singleChunk = config.singleChunk ?? false;

    console.log(`Fetching users for ${config.name}...`);
    const users = fetchUsers(config.userQuery);
    if (users.length === 0) {
        console.log("No users found");
        return [];
    }
    console.log(`Fetched ${users.length} users`);

    const mode = parallelism > 1 ? `${parallelism} parallel` : "sequential";
    console.log(
        `Scoring ${users.length} users (chunks of ${chunkSize}, ${mode})...`,
    );

    const allScores = new Map<string, { score: number; signals: string[] }>();
    const chunkRanges = buildChunkRanges(
        users.length,
        chunkSize,
        overlapSize,
        singleChunk,
    );

    let completedChunks = 0;
    const totalBatches = Math.ceil(chunkRanges.length / parallelism);

    for (
        let batchStart = 0;
        batchStart < chunkRanges.length;
        batchStart += parallelism
    ) {
        const batch = chunkRanges.slice(batchStart, batchStart + parallelism);
        const batchIndex = Math.floor(batchStart / parallelism) + 1;

        console.log(
            `Processing batch ${batchIndex}/${totalBatches} (${batch.length} chunks)...`,
        );

        const promises = batch.map(async (range) => {
            const chunk = users.slice(range.start, range.end);
            console.log(
                `  Chunk ${range.start + 1}-${range.end} of ${users.length}`,
            );
            const scores = await callScoringAPI(
                chunk,
                apiKey,
                modelName,
                config.buildPrompt,
            );
            return { chunk, scores };
        });

        const results = await Promise.all(promises);

        for (const { chunk, scores } of results) {
            for (let j = 0; j < chunk.length && j < scores.length; j++) {
                const user = chunk[j];
                const existing = allScores.get(user.email);
                if (!existing || scores[j].score > existing.score) {
                    allScores.set(user.email, scores[j]);
                }
            }
            completedChunks++;
        }

        console.log(
            `  Progress: ${completedChunks}/${chunkRanges.length} chunks (${allScores.size} users scored)`,
        );
    }

    const scoredUsers: ScoredUser[] = users.map((user) => {
        const scoreData = allScores.get(user.email) || {
            score: 0,
            signals: [],
        };
        return {
            ...user,
            score: scoreData.score,
            signals: scoreData.signals,
        };
    });

    console.log(`Scoring complete for ${config.name}`);
    return scoredUsers;
}
