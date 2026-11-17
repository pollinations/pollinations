import { z } from "zod";

// Character classes for password mode. The ambiguous set (I, l, 1, O, 0) is
// removed from every class when exclude_ambiguous is set.
const CLASSES = {
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
};
const AMBIGUOUS = new Set(["I", "l", "1", "O", "0"]);

// Wordlist for passphrase mode: common short words, easy to type and read
// aloud. Passphrase strength comes from the word count, and the tool reports
// the entropy so the caller can see it.
const WORDS = [
    "apple",
    "banana",
    "cherry",
    "dragon",
    "eagle",
    "falcon",
    "garden",
    "harbor",
    "island",
    "jungle",
    "kite",
    "lemon",
    "mango",
    "nickel",
    "ocean",
    "panda",
    "queen",
    "river",
    "sunset",
    "tiger",
    "anchor",
    "arrow",
    "autumn",
    "bacon",
    "badge",
    "banner",
    "barn",
    "barrel",
    "basket",
    "beacon",
    "bear",
    "beaver",
    "beetle",
    "berry",
    "bicycle",
    "birch",
    "bird",
    "blanket",
    "blossom",
    "blueberry",
    "bolt",
    "book",
    "border",
    "breeze",
    "brick",
    "bridge",
    "bright",
    "bronze",
    "brook",
    "brown",
    "bubble",
    "bucket",
    "buffalo",
    "bugle",
    "builder",
    "bullet",
    "cabin",
    "cable",
    "cactus",
    "camel",
    "camera",
    "candle",
    "canyon",
    "canvas",
    "captain",
    "caramel",
    "carbon",
    "castle",
    "catalog",
    "cattle",
    "cedar",
    "celery",
    "cellar",
    "century",
    "chain",
    "chair",
    "chalk",
    "cheese",
    "chestnut",
    "chicken",
    "chimney",
    "circle",
    "circus",
    "citrus",
    "city",
    "civil",
    "clam",
    "clover",
    "coach",
    "cocoa",
    "coffee",
    "coin",
    "collar",
    "comet",
    "compass",
    "cookie",
    "copper",
    "coral",
    "cork",
    "corn",
    "cottage",
    "cotton",
    "couch",
    "cougar",
    "county",
    "cousin",
    "coyote",
    "crab",
    "cradle",
    "crane",
    "crate",
    "crater",
    "creek",
    "cricket",
    "crown",
    "crystal",
    "curtain",
    "cushion",
    "custard",
    "cycle",
    "dagger",
    "daisy",
    "dancer",
    "danger",
    "dark",
    "dawn",
    "daylight",
    "dealer",
    "debate",
    "decade",
    "december",
    "deck",
    "deer",
    "delta",
    "desert",
    "design",
    "desk",
    "diamond",
    "diary",
    "dice",
    "diesel",
    "dinner",
    "dirt",
    "disco",
    "dish",
    "doctor",
    "dog",
    "doll",
    "dolphin",
    "donut",
    "door",
    "dove",
    "drum",
    "duck",
    "dune",
    "dust",
    "earth",
    "east",
    "echo",
    "eclipse",
    "edge",
    "editor",
    "effort",
    "egg",
    "elbow",
    "elder",
    "elephant",
    "elite",
    "elm",
    "ember",
    "engine",
    "enjoy",
    "envelope",
    "episode",
    "equal",
    "error",
    "escape",
    "estate",
    "evening",
    "event",
    "every",
    "exact",
    "exam",
    "excess",
    "exchange",
    "excuse",
    "exercise",
    "exist",
    "exit",
    "exotic",
    "explain",
    "explore",
    "export",
    "express",
    "fabric",
    "face",
    "factor",
    "factory",
    "fade",
    "fairy",
    "faith",
    "famous",
    "fancy",
    "farm",
    "fashion",
    "fast",
    "father",
    "feather",
    "feature",
    "february",
    "fence",
    "fever",
    "fiction",
    "field",
    "fierce",
    "figure",
    "file",
    "film",
    "filter",
    "final",
    "finance",
    "finger",
    "finish",
    "fire",
    "fish",
    "fitness",
    "flame",
    "flash",
    "flavor",
    "fleet",
    "flesh",
    "flight",
    "float",
    "flood",
    "floor",
    "flour",
    "flower",
    "fluid",
    "flush",
    "focus",
    "fog",
    "folder",
    "follow",
    "food",
    "foot",
    "forest",
    "forget",
    "fork",
    "form",
    "fortune",
    "forward",
    "fossil",
    "foster",
    "found",
    "fountain",
    "fox",
];

// Uniform random index in [0, n) with rejection sampling, so every index is
// equally likely: crypto.getRandomValues is uniform over 2^32 values, and n
// rarely divides 2^32, so a plain modulo would favour the low indices.
function randomIndex(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buffer = new Uint32Array(1);
    let value;
    do {
        crypto.getRandomValues(buffer);
        value = buffer[0];
    } while (value >= limit);
    return value % n;
}

export const passwordTools = [
    [
        "password_generate",
        "Generate a secure random password or passphrase, computed locally — no network or model calls. Randomness comes from crypto.getRandomValues (the Web Crypto CSPRNG, available in Workers), never Math.random. Password mode picks uniformly from the selected character classes (length 8–128, at least one class required) and guarantees at least one character from each selected class; exclude_ambiguous drops easily confused characters (I, l, 1, O, 0). Passphrase mode joins random words from a built-in wordlist instead — length and character classes are ignored there. The result reports the entropy in bits, so the caller can judge the strength.",
        {
            length: z
                .number()
                .int()
                .min(8)
                .max(128)
                .default(16)
                .describe(
                    "Password length in characters, 8–128. Ignored in passphrase mode.",
                ),
            lowercase: z
                .boolean()
                .default(true)
                .describe("Include lowercase letters (a–z)."),
            uppercase: z
                .boolean()
                .default(true)
                .describe("Include uppercase letters (A–Z)."),
            digits: z.boolean().default(true).describe("Include digits (0–9)."),
            symbols: z
                .boolean()
                .default(true)
                .describe("Include symbols (!@#$%^&*()-_=+[]{};:,.<>?)."),
            exclude_ambiguous: z
                .boolean()
                .default(false)
                .describe(
                    "Remove easily confused characters (I, l, 1, O, 0) from every class.",
                ),
            passphrase: z
                .boolean()
                .default(false)
                .describe(
                    "Set true to generate a passphrase of random words instead of a password; length and character classes are ignored.",
                ),
            words: z
                .number()
                .int()
                .min(3)
                .max(8)
                .default(4)
                .describe("Number of words in passphrase mode, 3–8."),
            separator: z
                .string()
                .min(1)
                .max(3)
                .default("-")
                .describe("Word separator in passphrase mode."),
        },
        ({
            length,
            lowercase,
            uppercase,
            digits,
            symbols,
            exclude_ambiguous,
            passphrase,
            words,
            separator,
        }) => {
            if (passphrase) {
                const phrase = Array.from(
                    { length: words },
                    () => WORDS[randomIndex(WORDS.length)],
                ).join(separator);
                return {
                    password: phrase,
                    mode: "passphrase",
                    words,
                    separator,
                    length: phrase.length,
                    entropy_bits:
                        Math.round(words * Math.log2(WORDS.length) * 10) / 10,
                };
            }

            const selected = [];
            if (lowercase) selected.push("lowercase");
            if (uppercase) selected.push("uppercase");
            if (digits) selected.push("digits");
            if (symbols) selected.push("symbols");
            if (selected.length === 0)
                throw new Error(
                    "at least one character class must be enabled: lowercase, uppercase, digits or symbols.",
                );

            const pools = selected.map((name) =>
                [...CLASSES[name]]
                    .filter((c) => !exclude_ambiguous || !AMBIGUOUS.has(c))
                    .join(""),
            );
            const pool = pools.join("");
            // One character from each selected class first, so the result
            // always honours every class, then fill from the whole pool.
            const chars = pools.map(
                (characters) => characters[randomIndex(characters.length)],
            );
            while (chars.length < length)
                chars.push(pool[randomIndex(pool.length)]);
            // Fisher–Yates shuffle so the guaranteed characters are not
            // always at the front.
            for (let i = chars.length - 1; i > 0; i--) {
                const j = randomIndex(i + 1);
                [chars[i], chars[j]] = [chars[j], chars[i]];
            }
            return {
                password: chars.join(""),
                mode: "password",
                length,
                classes: selected,
                exclude_ambiguous,
                entropy_bits:
                    Math.round(length * Math.log2(pool.length) * 10) / 10,
            };
        },
    ],
];
