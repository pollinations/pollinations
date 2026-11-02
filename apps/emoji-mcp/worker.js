import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

/**
 * Emoji lookup MCP server.
 *
 * A small curated set of emoji with their names, keywords and groups, so an
 * agent can go from "a word that means calm" to an actual character without a
 * network round-trip or a third-party API key. Everything is embedded, so the
 * worker has no upstream dependency and no billing of its own.
 */

// name -> [char, keywords...]
const EMOJI = [
    ["grinning", "😀", "smile", "happy", "face"],
    ["joy", "😂", "laugh", "tears", "funny"],
    ["smile", "😄", "happy", "grin"],
    ["wink", "😉", "flirt", "joke"],
    ["heart_eyes", "😍", "love", "adore"],
    ["thinking", "🤔", "hmm", "consider"],
    ["neutral_face", "😐", "meh", "flat"],
    ["slightly_smiling", "🙂", "ok", "fine"],
    ["upside_down", "🙃", "silly", "irony"],
    ["rolling_eyes", "🙄", "annoyed", "whatever"],
    ["smirk", "😏", "sly", "confident"],
    ["cry", "😢", "sad", "tear"],
    ["sob", "😭", "crying", "loud"],
    ["angry", "😠", "mad", "annoyed"],
    ["rage", "😡", "furious", "boiling"],
    ["scream", "😱", "shock", "fear"],
    ["cold_sweat", "😰", "nervous", "anxious"],
    ["sleeping", "😴", "tired", "sleep", "zzz"],
    ["mask", "😷", "sick", "ill"],
    ["nerd", "🤓", "geek", "smart"],
    ["sunglasses", "😎", "cool", "chill"],
    ["partying", "🥳", "celebrate", "party"],
    ["star_struck", "🤩", "amazed", "wow"],
    ["exploding_head", "🤯", "mindblown", "shock"],
    ["hugs", "🤗", "hug", "warm"],
    ["shrug", "🤷", "idk", "unsure"],
    ["facepalm", "🤦", "oops", "embarrassed"],
    ["pray", "🙏", "thanks", "please", "hope"],
    ["clap", "👏", "applause", "bravo"],
    ["thumbs_up", "👍", "yes", "ok", "approve"],
    ["thumbs_down", "👎", "no", "disapprove"],
    ["wave", "👋", "hello", "bye", "hi"],
    ["ok_hand", "👌", "perfect", "agreed"],
    ["muscle", "💪", "strong", "power"],
    ["eyes", "👀", "look", "watching"],
    ["brain", "🧠", "think", "smart", "mind"],
    ["fire", "🔥", "hot", "great", "lit"],
    ["rocket", "🚀", "launch", "fast", "ship"],
    ["sparkles", "✨", "magic", "shiny", "new"],
    ["star", "⭐", "favorite", "rating"],
    ["boom", "💥", "explosion", "impact"],
    ["zap", "⚡", "fast", "energy", "power"],
    ["bulb", "💡", "idea", "insight"],
    ["wrench", "🔧", "fix", "tool"],
    ["hammer", "🔨", "build", "tool"],
    ["gear", "⚙️", "settings", "config"],
    ["lock", "🔒", "secure", "private"],
    ["key", "🔑", "access", "secret"],
    ["shield", "🛡️", "protect", "safety", "security"],
    ["mag", "🔍", "search", "find", "inspect"],
    ["memo", "📝", "note", "write", "draft"],
    ["book", "📖", "read", "docs"],
    ["books", "📚", "library", "learn", "docs"],
    ["chart_up", "📈", "growth", "increase", "data"],
    ["chart_down", "📉", "drop", "decrease", "loss"],
    ["package", "📦", "box", "deploy", "ship"],
    ["calendar", "📅", "date", "schedule"],
    ["clock", "🕐", "time", "wait"],
    ["hourglass", "⏳", "wait", "pending"],
    ["mailbox", "📫", "mail", "email", "inbox"],
    ["phone", "📱", "mobile", "app"],
    ["computer", "💻", "laptop", "code", "dev"],
    ["robot", "🤖", "bot", "ai", "agent"],
    ["brain_circuit", "🧠", "ai", "model"],
    ["satellite", "📡", "signal", "network"],
    ["globe", "🌍", "world", "earth", "global"],
    ["sun", "☀️", "sunny", "day", "bright"],
    ["moon", "🌙", "night", "dark", "sleep"],
    ["cloud", "☁️", "weather", "sky"],
    ["rain", "🌧️", "weather", "wet"],
    ["snow", "❄️", "cold", "winter", "ice"],
    ["rainbow", "🌈", "color", "pride", "hope"],
    ["ocean", "🌊", "wave", "sea", "water"],
    ["mountain", "⛰️", "peak", "high", "climb"],
    ["tree", "🌳", "nature", "green", "plant"],
    ["flower", "🌸", "bloom", "spring", "pretty"],
    ["leaf", "🍃", "nature", "green", "fresh"],
    ["cat", "🐱", "pet", "meow", "animal"],
    ["dog", "🐶", "pet", "woof", "animal"],
    ["fox", "🦊", "animal", "clever"],
    ["penguin", "🐧", "animal", "cold", "cute"],
    ["whale", "🐳", "sea", "big", "animal"],
    ["bee", "🐝", "honey", "work", "busy"],
    ["butterfly", "🦋", "change", "transform", "pretty"],
    ["apple", "🍎", "fruit", "food", "red"],
    ["coffee", "☕", "drink", "morning", "caffeine"],
    ["pizza", "🍕", "food", "slice", "cheese"],
    ["cake", "🍰", "dessert", "birthday", "sweet"],
    ["beer", "🍺", "drink", "cheers", "pub"],
    ["wine", "🍷", "drink", "dinner", "red"],
    ["bomb", "💣", "danger", "explode"],
    ["skull", "💀", "dead", "danger", "death"],
    ["ghost", "👻", "spooky", "invisible"],
    ["alien", "👽", "space", "weird"],
    ["crown", "👑", "king", "winner", "best"],
    ["trophy", "🏆", "win", "prize", "award"],
    ["medal", "🏅", "award", "achievement"],
    ["dart", "🎯", "target", "goal", "bullseye"],
    ["check", "✅", "done", "yes", "ok"],
    ["x", "❌", "no", "wrong", "fail"],
    ["warning", "⚠️", "careful", "caution", "warn"],
    ["question", "❓", "ask", "unknown"],
    ["bang", "❗", "important", "alert"],
    ["plus", "➕", "add", "more"],
    ["minus", "➖", "remove", "less"],
    ["arrow_right", "➡️", "next", "forward"],
    ["arrow_left", "⬅️", "back", "previous"],
    ["arrow_up", "⬆️", "up", "top"],
    ["arrow_down", "⬇️", "down", "bottom"],
    ["refresh", "🔄", "retry", "sync", "reload"],
    ["infinity", "♾️", "endless", "loop"],
    ["heart", "❤️", "love", "like", "favorite"],
    ["broken_heart", "💔", "sad", "breakup"],
    ["hundred", "💯", "perfect", "score", "full"],
    ["money", "💰", "cash", "rich", "payment"],
    ["credit_card", "💳", "pay", "billing"],
    ["receipt", "🧾", "invoice", "bill", "proof"],
    ["gift", "🎁", "present", "bonus", "reward"],
    ["ticket", "🎫", "entry", "access", "event"],
    ["megaphone", "📢", "announce", "broadcast"],
    ["bell", "🔔", "notify", "alert", "reminder"],
    ["speech", "💬", "chat", "talk", "comment"],
    ["thought", "💭", "think", "idea"],
    ["zzz_sleep", "💤", "sleep", "tired"],
    ["wave_hand", "🌊", "wave", "sea"],
    ["seedling", "🌱", "grow", "new", "start"],
    ["recycle", "♻️", "reuse", "green"],
    ["puzzle", "🧩", "solve", "fit", "part"],
    ["dice", "🎲", "random", "chance", "roll"],
    ["abacus", "🧮", "math", "calculate", "count"],
    ["magnifier_tilt", "🔎", "search", "zoom", "detail"],
    ["link", "🔗", "url", "chain", "connect"],
    ["paperclip", "📎", "attach", "file"],
    ["folder", "📁", "directory", "files"],
    ["floppy", "💾", "save", "disk"],
    ["trash", "🗑️", "delete", "remove"],
    ["broom", "🧹", "clean", "clear"],
    ["test_tube", "🧪", "test", "experiment", "lab"],
    ["dna", "🧬", "biology", "genetics"],
    ["microscope", "🔬", "science", "inspect"],
    ["telescope", "🔭", "space", "far", "observe"],
    ["compass", "🧭", "direction", "navigate"],
    ["map", "🗺️", "travel", "route", "world"],
    ["anchor", "⚓", "stable", "sea", "hold"],
    ["scales", "⚖️", "justice", "balance", "legal"],
    ["stopwatch", "⏱️", "timer", "speed", "measure"],
    ["thermometer", "🌡️", "temperature", "heat"],
    ["umbrella", "☂️", "rain", "cover", "protect"],
    ["door", "🚪", "enter", "exit", "open"],
    ["bed", "🛏️", "sleep", "rest", "hotel"],
    ["house", "🏠", "home", "live", "building"],
    ["office", "🏢", "work", "company", "building"],
    ["factory", "🏭", "industry", "build", "production"],
    ["bank", "🏦", "money", "finance"],
    ["hospital", "🏥", "health", "medical"],
    ["school", "🏫", "learn", "education"],
    ["castle", "🏰", "history", "strong"],
    ["statue", "🗽", "freedom", "landmark"],
    ["tent", "⛺", "camp", "outdoor"],
];

function buildIndex() {
    const byName = new Map();
    for (const [name, char, ...keywords] of EMOJI) {
        byName.set(name, { name, char, keywords });
    }
    return byName;
}

const INDEX = buildIndex();

function search(query, limit = 10) {
    const q = String(query || "")
        .trim()
        .toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const { name, char, keywords } of INDEX.values()) {
        const haystack = [name, ...keywords].join(" ").toLowerCase();
        let score = 0;
        if (name === q) score = 100;
        else if (name.replace(/_/g, " ") === q) score = 95;
        else if (keywords.includes(q)) score = 80;
        else if (name.includes(q)) score = 60;
        else if (keywords.some((k) => k.includes(q))) score = 40;
        else if (haystack.includes(q)) score = 20;
        if (score > 0) scored.push({ name, char, keywords, score });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)));
}

/**
 * Prefix fallback for name lookups only: "rocketo" should still suggest the
 * rocket entries. Kept out of search() so a genuine miss ("zzzznotathing")
 * keeps returning an honest empty result.
 */
function nearMatches(query, limit = 5) {
    const q = String(query || "")
        .trim()
        .toLowerCase();
    if (q.length < 3) return [];
    const stem = q.slice(0, Math.min(3, q.length));
    const out = [];
    for (const { name, char, keywords } of INDEX.values()) {
        if (name.startsWith(stem) || keywords.some((k) => k.startsWith(stem))) {
            out.push({ name, char, keywords });
            if (out.length >= limit) break;
        }
    }
    return out;
}

function buildServer() {
    const server = new McpServer(
        { name: "emoji-mcp", title: "Emoji", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "search_emoji",
        {
            description:
                "Find emoji by a word, name or feeling. Returns matching emoji characters with their canonical names and keywords. " +
                "Use it when a reply benefits from one symbol that carries meaning (status, mood, category), not as decoration. " +
                `Covers ${INDEX.size} emoji across faces, objects, nature, food, symbols and places.`,
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(64)
                    .describe(
                        "Word, name or feeling to look for, e.g. 'fire', 'calm', 'warning'.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("Maximum results, default 10."),
            }),
        },
        async ({ query, limit }) => {
            const results = search(query, limit);
            if (results.length === 0) {
                return createMCPResponse([
                    createTextContent(
                        `No emoji matched "${query}". Try a shorter or more common word.`,
                        true,
                    ),
                ]);
            }
            const lines = results.map(
                (r) =>
                    `${r.char}  ${r.name}  (${r.keywords.slice(0, 4).join(", ")})`,
            );
            return createMCPResponse([
                createTextContent(
                    `${results.length} match${results.length === 1 ? "" : "es"} for "${query}":\n${lines.join("\n")}`,
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "emoji_name",
        {
            description:
                "Look up one emoji by its exact canonical name (underscored, e.g. 'rocket', 'thumbs_up') and return its character and keywords.",
            inputSchema: z.object({
                name: z
                    .string()
                    .min(1)
                    .max(64)
                    .describe(
                        "Canonical emoji name in lowercase with underscores.",
                    ),
            }),
        },
        async ({ name }) => {
            const key = String(name).trim().toLowerCase().replace(/\s+/g, "_");
            const hit = INDEX.get(key);
            if (!hit) {
                const near = nearMatches(key, 5);
                const hint = near.length
                    ? ` Closest matches: ${near.map((n) => `${n.char} ${n.name}`).join(", ")}.`
                    : "";
                return createMCPResponse([
                    createTextContent(`No emoji named "${key}".${hint}`, true),
                ]);
            }
            return createMCPResponse([
                createTextContent(
                    `${hit.char}  ${hit.name}  (${hit.keywords.join(", ")})`,
                    true,
                ),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(buildServer);

function bearerToken(request) {
    const header = request.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                status: "ok",
                endpoint: "/",
                emoji: INDEX.size,
            });
        }

        const token = bearerToken(request);
        if (!token) {
            return new Response(
                JSON.stringify({
                    error: "unauthorized",
                    message:
                        "Provide a Pollinations API key as a Bearer token.",
                }),
                {
                    status: 401,
                    headers: {
                        "content-type": "application/json",
                        "www-authenticate":
                            'Bearer realm="emoji-mcp.pollinations.ai"',
                    },
                },
            );
        }

        if (
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
