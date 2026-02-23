/**
 * One-off test: Run Claude Sonnet 4.6 on 5k users via Anthropic API with streaming.
 *
 * Step 1: Dump user prompt to file for inspection
 *   npx tsx scripts/test-claude-scoring.ts dump
 *
 * Step 2: Send to Claude with streaming
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/test-claude-scoring.ts run
 */
import { execSync } from "node:child_process";
import {
    readFileSync,
    writeFileSync,
    appendFileSync,
    existsSync,
} from "node:fs";
import { formatDate } from "./llm-scorer.ts";

const LIMIT = 5000;
const USER_PROMPT_FILE = "scripts/results/claude-5k-user-prompt.txt";
const OUTPUT_FILE = "scripts/results/claude-5k-results.csv";
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Score each user 0-100 for abuse/bot likelihood. Most users are legitimate (score 0).

Signals (additive):
cluster: 3+ users with similar username/email patterns registering close together (+60)
seq: sequential usernames like agf01, agf02 (+40)
rand: gibberish username or email (+15)
disp: disposable/temp email domain (+25)

A single user with a hyphenated suffix (-dev, -cmyk, -blip) is normal GitHub behavior.
But 5 users all following the pattern "randomname-suffix" registering in the same minute IS a cluster.

Output ONLY CSV. No preamble, no analysis, no markdown. First output line must be a scored user.

Uabhishek05,0,
chatgptscripten-spec,60,cluster
leehuandong233-cmyk,60,cluster
agf01,100,seq+cluster`;

const command = process.argv[2];

if (command === "dump") {
    console.log(`Fetching ${LIMIT} users ordered by signup date...`);
    const cmd = `npx wrangler d1 execute DB --remote --env production --json --command "SELECT github_username, email, created_at FROM user WHERE github_username IS NOT NULL ORDER BY created_at DESC LIMIT ${LIMIT}"`;
    const raw = execSync(cmd, {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
    });
    const rows = JSON.parse(raw)[0]?.results || [];
    console.log(`Got ${rows.length} users`);

    const csvRows = rows.map(
        (r: any) =>
            `${r.github_username},${r.email},${formatDate(r.created_at)}`,
    );
    const userMessage = `Data (github,email,registered):\n${csvRows.join("\n")}`;

    writeFileSync(USER_PROMPT_FILE, userMessage);
    console.log(`Written to ${USER_PROMPT_FILE}`);
    console.log(
        `Chars: ${userMessage.length}, ~${Math.ceil(userMessage.length / 4)} tokens`,
    );
    console.log(`First 3: ${csvRows.slice(0, 3).join(" | ")}`);
    console.log(`Last 3: ${csvRows.slice(-3).join(" | ")}`);
} else if (command === "run") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error("Set ANTHROPIC_API_KEY");
        process.exit(1);
    }
    if (!existsSync(USER_PROMPT_FILE)) {
        console.error(`Run 'dump' first`);
        process.exit(1);
    }

    const allLines = readFileSync(USER_PROMPT_FILE, "utf-8").split("\n");
    const header = allLines[0]; // "Data (github,email,registered):"
    const dataLines = allLines.slice(1);
    const CHUNK_SIZE = 1000;
    const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);

    console.log(`Total: ${dataLines.length} users, ${totalChunks} chunks of ${CHUNK_SIZE}`);
    writeFileSync(OUTPUT_FILE, ""); // truncate

    let totalLines = 0;
    const allScores: number[] = [];

    for (let i = 0; i < totalChunks; i++) {
        const chunk = dataLines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const userMessage = `${header}\n${chunk.join("\n")}`;
        console.log(`\n--- Chunk ${i + 1}/${totalChunks}: ${chunk.length} users, ${userMessage.length} chars`);

        const body = JSON.stringify({
            model: MODEL,
            max_tokens: 64000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
            stream: true,
            temperature: 0.1,
        });

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body,
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.error(`API error ${resp.status}: ${err}`);
            process.exit(1);
        }

        let chunkLines = 0;
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split("\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
                if (!part.startsWith("data: ")) continue;
                const data = part.slice(6);
                if (data === "[DONE]") continue;
                try {
                    const evt = JSON.parse(data);
                    if (evt.type === "content_block_delta" && evt.delta?.text) {
                        appendFileSync(OUTPUT_FILE, evt.delta.text);
                        const newLines = (evt.delta.text.match(/\n/g) || []).length;
                        chunkLines += newLines;
                        if (newLines > 0)
                            process.stderr.write(`\r  chunk ${i + 1}: ${chunkLines} lines`);
                    }
                } catch {}
            }
        }

        totalLines += chunkLines;
        console.log(`\n  chunk ${i + 1} done: ${chunkLines} lines (total: ${totalLines})`);
    }

    console.log(`\nAll done. ${totalLines} lines in ${OUTPUT_FILE}`);

    // Quick stats
    const results = readFileSync(OUTPUT_FILE, "utf-8");
    const resultLines = results.split("\n").filter((l) => l.includes(",") && !l.startsWith("github,"));
    const scores = resultLines.map((l) => parseInt(l.split(",")[1], 10) || 0);
    const dist: Record<number, number> = {};
    scores.forEach((s) => { dist[s] = (dist[s] || 0) + 1; });
    console.log(`Parsed ${resultLines.length} scores`);
    console.log(`Distribution:`, dist);
} else {
    console.log("Usage: npx tsx scripts/test-claude-scoring.ts [dump|run]");
}
