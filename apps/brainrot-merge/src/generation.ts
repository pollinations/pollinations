import type { Specimen } from "./brainrot";
import { extractFigure } from "./figure";

const API_BASE = "https://gen.pollinations.ai";
const TEXT_MODEL = "claude";
const IMAGE_MODEL = "zimage";
const VOICE_MODEL = "elevenlabs";
// The canonical brainrot narrator: a deep, theatrical Italian male delivery.
const VOICE_NAME = "adam";
const TEXT_THINKING_BUDGET = 1024;

type GeneratedPayload = {
    name?: unknown;
    description?: unknown;
    imagePrompt?: unknown;
    catchphrase?: unknown;
};

// The meme's canonical lines are blasphemous; generated ones must not be.
// Defense in depth on top of the prompt instructions: a flagged catchphrase
// is replaced, never spoken.
const CATCHPHRASE_BLOCKLIST =
    /porco\s*dio|porco\s*all|dio\s+(cane|porco)|porca\s+madonna|madonna\s+(cane|porca)|cazz|fottut|stronz|merd|vaffancul|puttan|bestemmi|gaza|palestin/i;

function textValue(value: unknown, maxLength: number) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLength);
}

function catchphraseValue(value: unknown, name: string) {
    const text = textValue(value, 140);
    if (!text || CATCHPHRASE_BLOCKLIST.test(text)) {
        return `Mamma mia! ${name}!`;
    }
    return text;
}

function nameValue(value: unknown) {
    const text = textValue(value, 36);
    if (!text) return null;
    const cleaned = text
        .replace(/[^a-zA-ZÀ-ÿ0-9 -]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return null;
    const words = cleaned
        .split(/[\s-]+/)
        .filter(Boolean)
        .slice(0, 4);
    if (words.length === 0 || words.some((word) => word.length > 14)) {
        return null;
    }
    return words.join(" ");
}

function buildUserPrompt(args: {
    left: Pick<Specimen, "name" | "description">;
    right: Pick<Specimen, "name" | "description">;
}) {
    return [
        `Parent A: ${args.left.name} — ${args.left.description}`,
        `Parent B: ${args.right.name} — ${args.right.description}`,
        "Invent one NEW Italian brainrot character by fusing the two parents into a single absurd hybrid creature.",
        "The order of the parents does not matter; both must be physically visible in the hybrid.",
        "Name grammar (follow exactly): 2-3 pseudo-Italian words. The main words must rhyme or share their final syllable. Italianize every word: end in a vowel, double a consonant, use suffixes like -ino, -ini, -ina, -ello, -illo, -oni, -etto. Optionally start with a repeated onomatopoeia of the sound it makes.",
        "Good name shapes: Bombardiro Crocodilo, Chimpanzini Bananini, Trippi Troppi, Brr Brr Patapim.",
        "Do NOT copy existing famous brainrot character names; invent a new one in the same style.",
        "The description is one absurd deadpan English sentence of lore about the character, under 80 chars.",
        "The catchphrase is its dramatic Italian intro line, 6-16 words: start by chanting the name, then describe the creature with total operatic seriousness. It may declare its parentage (figlio di ... e ...). Simple Italian, present tense.",
        "The catchphrase must be family-friendly: absolutely no blasphemy, profanity, religion, war, real people, or real brands.",
        "The imagePrompt describes the hybrid creature plainly in English: which animal and object are fused, body parts, what it wears. 10-18 words.",
        'Return JSON: {"name":"2-3 pseudo-Italian words","description":"one absurd English sentence under 80 chars","imagePrompt":"plain visual description of the hybrid creature, 10-18 words","catchphrase":"dramatic Italian intro, 6-16 words"}',
    ].join("\n");
}

function promptSeed(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(31, hash) + value.charCodeAt(index);
    }
    return String(Math.abs(hash) % 2147483647);
}

function parseJsonObject(text: string): GeneratedPayload {
    try {
        return JSON.parse(text) as GeneratedPayload;
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return {};
        try {
            return JSON.parse(match[0]) as GeneratedPayload;
        } catch {
            return {};
        }
    }
}

async function apiError(response: Response) {
    try {
        const payload = (await response.json()) as {
            error?: { message?: string };
            message?: string;
        };
        return (
            payload.error?.message ??
            payload.message ??
            `${response.status} ${response.statusText}`
        );
    } catch {
        return `${response.status} ${response.statusText}`;
    }
}

export async function generateSpecimen(args: {
    apiKey: string;
    parents: [
        Pick<Specimen, "name" | "description">,
        Pick<Specimen, "name" | "description">,
    ];
}): Promise<Specimen> {
    const [left, right] = args.parents;

    const textResponse = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: TEXT_MODEL,
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 1800,
            thinking: {
                type: "enabled",
                budget_tokens: TEXT_THINKING_BUDGET,
            },
            thinking_budget: TEXT_THINKING_BUDGET,
            messages: [
                {
                    role: "system",
                    content:
                        "You invent Italian brainrot characters for a physics merge game. Return only valid JSON.",
                },
                {
                    role: "user",
                    content: buildUserPrompt({ left, right }),
                },
            ],
        }),
    });

    if (!textResponse.ok) {
        throw new Error(await apiError(textResponse));
    }

    const textPayload = (await textResponse.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
    };
    const payload = parseJsonObject(
        textPayload.choices?.[0]?.message?.content ?? "",
    );
    const name = nameValue(payload.name);
    const description = textValue(payload.description, 80);
    const imagePrompt = textValue(payload.imagePrompt, 360);
    if (!name || !description || !imagePrompt) {
        throw new Error("Model returned incomplete character details.");
    }

    return generateImageSpecimen({
        apiKey: args.apiKey,
        specimen: {
            name,
            description,
            imagePrompt,
            catchphrase: catchphraseValue(payload.catchphrase, name),
        },
    });
}

export async function generateImageSpecimen(args: {
    apiKey: string;
    specimen: Specimen;
}): Promise<Specimen> {
    // Subject first so the diffusion model anchors on the creature. The plain
    // white background is load-bearing: figure.ts cuts the sprite out of it
    // and builds the physics hull from the silhouette.
    const subject = args.specimen.imagePrompt || args.specimen.name;
    const imagePrompt = [
        subject,
        `a depiction of ${args.specimen.name}`,
        "one single character, whole figure fully visible",
        "full body shot, centered, feet and all extremities inside the frame",
        "isolated on a plain solid white background",
        "hyperrealistic photo, glossy 3d-render look, oversaturated colors",
        "bright studio lighting, slightly uncanny viral AI meme aesthetic",
        "no text, no watermark",
    ].join(", ");

    const imageParams = new URLSearchParams({
        model: IMAGE_MODEL,
        width: "512",
        height: "512",
        nologo: "true",
        safe: "true",
        seed: promptSeed(imagePrompt),
    });
    const imageResponse = await fetch(
        `${API_BASE}/image/${encodeURIComponent(imagePrompt)}?${imageParams}`,
        {
            headers: {
                Authorization: `Bearer ${args.apiKey}`,
            },
        },
    );

    if (!imageResponse.ok) {
        throw new Error(await apiError(imageResponse));
    }

    const imageBlob = await imageResponse.blob();
    const figure = await extractFigure(imageBlob);

    return {
        ...args.specimen,
        imagePrompt,
        imageUrl: URL.createObjectURL(imageBlob),
        figure: figure ?? undefined,
    };
}

/** Speak a catchphrase aloud: resolves to an object URL of the mp3. */
export async function generateVoiceLine(args: {
    apiKey: string;
    text: string;
}): Promise<string> {
    const voiceParams = new URLSearchParams({
        model: VOICE_MODEL,
        voice: VOICE_NAME,
    });
    const response = await fetch(
        `${API_BASE}/audio/${encodeURIComponent(`[dramatic] ${args.text}`)}?${voiceParams}`,
        {
            headers: {
                Authorization: `Bearer ${args.apiKey}`,
            },
        },
    );
    if (!response.ok) {
        throw new Error(await apiError(response));
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}
