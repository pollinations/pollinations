import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import type { SafeValue } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { applySafetyToTexts } from "@/middleware/safety.ts";

type SafetyTextTarget = { text: string; set: (value: string) => void };

function collectTextParts(value: unknown, targets: SafetyTextTarget[]): void {
    if (!Array.isArray(value)) return;
    for (const rawPart of value) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as Record<string, unknown>;
        if (
            (part.type === "input_text" || part.type === "output_text") &&
            typeof part.text === "string"
        ) {
            targets.push({
                text: part.text,
                set: (text) => {
                    part.text = text;
                },
            });
        }
    }
}

/** Apply safety rewrites without converting the Responses request. */
export async function applySafetyToResponseRequest(
    c: Context<Env>,
    body: CreateResponseRequest,
): Promise<CreateResponseRequest> {
    const next = structuredClone(body);
    const targets: SafetyTextTarget[] = [];

    if (typeof next.instructions === "string") {
        targets.push({
            text: next.instructions,
            set: (value) => {
                next.instructions = value;
            },
        });
    }
    if (typeof next.input === "string") {
        targets.push({
            text: next.input,
            set: (value) => {
                next.input = value;
            },
        });
    } else {
        for (const rawItem of next.input) {
            if (!rawItem || typeof rawItem !== "object") continue;
            const item = rawItem as Record<string, unknown>;
            if (typeof item.output === "string") {
                targets.push({
                    text: item.output,
                    set: (value) => {
                        item.output = value;
                    },
                });
            } else {
                collectTextParts(item.output, targets);
            }
            if (typeof item.content === "string") {
                targets.push({
                    text: item.content,
                    set: (value) => {
                        item.content = value;
                    },
                });
                continue;
            }
            collectTextParts(item.content, targets);
        }
    }

    const safeTexts = await applySafetyToTexts(
        c,
        targets.map((target) => target.text),
        body.safe as SafeValue,
    );
    let changed = false;
    for (const [index, target] of targets.entries()) {
        if (safeTexts[index] === target.text) continue;
        target.set(safeTexts[index]);
        changed = true;
    }
    return changed ? next : body;
}
