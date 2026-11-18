import { z } from "zod";

// Standard ITU Morse mapping: letters, digits and the common punctuation set.
// The table is the whole encoder — decode is the same table read backwards.
const MORSE = {
    A: ".-",
    B: "-...",
    C: "-.-.",
    D: "-..",
    E: ".",
    F: "..-.",
    G: "--.",
    H: "....",
    I: "..",
    J: ".---",
    K: "-.-",
    L: ".-..",
    M: "--",
    N: "-.",
    O: "---",
    P: ".--.",
    Q: "--.-",
    R: ".-.",
    S: "...",
    T: "-",
    U: "..-",
    V: "...-",
    W: ".--",
    X: "-..-",
    Y: "-.--",
    Z: "--..",
    0: "-----",
    1: ".----",
    2: "..---",
    3: "...--",
    4: "....-",
    5: ".....",
    6: "-....",
    7: "--...",
    8: "---..",
    9: "----.",
    ".": ".-.-.-",
    ",": "--..--",
    "?": "..--..",
    "'": ".----.",
    "!": "-.-.--",
    "/": "-..-.",
    "(": "-.--.",
    ")": "-.--.-",
    "&": ".-...",
    ":": "---...",
    ";": "-.-.-.",
    "=": "-...-",
    "+": ".-.-.",
    "-": "-....-",
    _: "..--.-",
    '"': ".-..-.",
    $: "...-..-",
    "@": ".--.-.",
};

const FROM_MORSE = Object.fromEntries(
    Object.entries(MORSE).map(([character, code]) => [code, character]),
);

export function encodeMorse(text) {
    // Words split on whitespace; a single space separates letters, " / "
    // separates words. The slash character itself encodes to -..-., so it
    // never collides with the word separator token.
    return text
        .trim()
        .toUpperCase()
        .split(/\s+/)
        .map((word) =>
            [...word]
                .map((character, index) => {
                    const code = MORSE[character];
                    if (code === undefined)
                        throw new Error(
                            `value ${JSON.stringify(text)} has no Morse code for ${JSON.stringify(character)} at position ${index}.`,
                        );
                    return code;
                })
                .join(" "),
        )
        .join(" / ");
}

export function decodeMorse(text) {
    const body = text.trim();
    if (body === "")
        throw new Error(`value ${JSON.stringify(text)} has no Morse code.`);
    const characters = [];
    for (const [index, token] of body.split(/\s+/).entries()) {
        if (token === "/") {
            characters.push(" ");
            continue;
        }
        const character = FROM_MORSE[token];
        if (character === undefined)
            throw new Error(
                `value ${JSON.stringify(text)} is not valid Morse code: ${JSON.stringify(token)} at token ${index}.`,
            );
        characters.push(character);
    }
    // A doubled or trailing "/" leaves a stray space; collapse and trim.
    return characters.join("").replace(/ +/g, " ").trim();
}

export const morseTools = [
    [
        "morse_code",
        'Convert text to Morse code and back, computed locally — no network or model calls. Standard ITU mapping; letters are separated by a space and words by " / ". Lowercase text is accepted and read as uppercase. This translates text, it does not inspect characters like inspect_unicode does.',
        {
            text: z
                .string()
                .min(1)
                .max(4096)
                .describe(
                    "The text to encode (encode) or the Morse code to decode (decode).",
                ),
            direction: z
                .enum(["encode", "decode"])
                .default("encode")
                .describe("Conversion direction."),
        },
        ({ text, direction }) => {
            if (direction === "encode") {
                const normalized = text
                    .trim()
                    .toUpperCase()
                    .split(/\s+/)
                    .join(" ");
                if (normalized === "")
                    throw new Error(
                        `value ${JSON.stringify(text)} has no characters to convert.`,
                    );
                return { text: normalized, morse: encodeMorse(text) };
            }
            return {
                text: decodeMorse(text),
                morse: text.trim().split(/\s+/).join(" "),
            };
        },
    ],
];
