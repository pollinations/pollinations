import type { LifeRung, LifeStylePreset, Specimen } from "./life";

const API_BASE = "https://gen.pollinations.ai";
const TEXT_MODEL = "claude-large";
const IMAGE_MODEL = "zimage";

type GeneratedPayload = {
    name?: unknown;
    description?: unknown;
    imagePrompt?: unknown;
};

const COMPLICATED_NAME_PARTS = [
    /adenine/i,
    /cyanobacter/i,
    /glycine/i,
    /lignin/i,
    /mycorrhiz/i,
    /nucleotide/i,
    /phytoplankton/i,
    /protocell/i,
    /ribose/i,
    /buddy/i,
    /critter/i,
    /spark/i,
    /sproutbug/i,
    /whimsy/i,
];

function textValue(value: unknown, maxLength: number) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLength);
}

function nameValue(value: unknown) {
    const text = textValue(value, 28);
    if (!text) return null;
    const cleaned = text
        .replace(/[^a-zA-Z0-9 -]/g, "")
        .replace(/\bthe\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return null;
    if (COMPLICATED_NAME_PARTS.some((part) => part.test(cleaned))) {
        return null;
    }

    const words = cleaned
        .split(/[\s-]+/)
        .filter(Boolean)
        .slice(0, 2);
    if (words.length === 0 || words.some((word) => word.length > 12)) {
        return null;
    }
    return words.join(" ");
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
    targetRung: LifeRung;
    parentNames: [string, string];
    evolutionPrompt: string;
    style: LifeStylePreset;
}): Promise<Specimen> {
    const [left, right] = args.parentNames;

    const textResponse = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: TEXT_MODEL,
            response_format: { type: "json_object" },
            temperature: 0.55,
            max_tokens: 220,
            messages: [
                {
                    role: "system",
                    content:
                        "You name generated objects for a physics merge game. Return only valid JSON.",
                },
                {
                    role: "user",
                    content: [
                        `Parents: ${left} + ${right}.`,
                        `Evolution prompt: ${args.evolutionPrompt}.`,
                        `Visual style: ${args.style.label}. ${args.style.prompt}.`,
                        "The new token will be physically larger, but size is not a semantic category.",
                        "Make the result larger or more complex than the parents.",
                        "Make the result feel understandable from both parents.",
                        "Follow the evolution prompt exactly and keep the result inside that world.",
                        "Do not introduce unrelated domains unless the evolution prompt asks for that.",
                        "Use real common English nouns only. Do not coin words. Do not use cute nonsense names.",
                        "Good names: moss frog, copper wire, reef shell, moon sensor.",
                        "Bad names: buddy sproutbug, glimmerkin, sugarwhirl, tiny blob.",
                        "The description must be one concise sentence with no fluff.",
                        "The imagePrompt must plainly describe the physical object itself (shape, material, key features) so it is recognizable — not a person, character, or mascot. Do not mention game tokens, icons, circles, or style; those are added separately.",
                        'Return JSON: {"name":"1-2 common nouns","description":"one concise sentence under 80 chars","imagePrompt":"a plain visual description of the object itself, 8-15 words"}',
                    ].join("\n"),
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
        throw new Error("Model returned incomplete object details.");
    }

    return generateImageSpecimen({
        apiKey: args.apiKey,
        specimen: {
            name,
            description,
            imagePrompt,
        },
        style: args.style,
        targetRung: args.targetRung,
    });
}

export async function generateImageSpecimen(args: {
    apiKey: string;
    specimen: Specimen;
    style: LifeStylePreset;
    targetRung: LifeRung;
}): Promise<Specimen> {
    // Lead with the SUBJECT so the diffusion model anchors on the concept,
    // not the style boilerplate. Without this the model defaults to a generic
    // "game token / avatar" prior and renders a person pictogram for
    // everything (e.g. wood, fiber, plywood all became little human figures).
    const subject = args.specimen.imagePrompt || args.specimen.name;
    const imagePrompt = [
        subject,
        `a depiction of ${args.specimen.name}`,
        "single inanimate object, the thing itself",
        "no people, no human figure, no face, no character, no mascot",
        "large centered subject filling the frame",
        "very tight crop, minimal empty border",
        "no text",
        // Style is a modifier on the subject, not the primary subject.
        `rendered as ${args.style.prompt}`,
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

    return {
        ...args.specimen,
        imagePrompt,
        imageUrl: URL.createObjectURL(imageBlob),
    };
}
