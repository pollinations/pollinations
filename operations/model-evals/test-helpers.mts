/**
 * Shared helpers for the model-evals tests: fixtures for the catalog, a
 * deterministic clock, and a fake gen.pollinations.ai that can actually solve the
 * puzzles (so the grading path is exercised end to end rather than mocked away).
 *
 * Not a test file itself: the test runner only collects `*.test.mts`.
 */

import type { TextModel } from "./src/catalog.mts";

export type Behavior = "solve" | "wrong" | "error" | "timeout" | "rate_limited";

export const PRICING = {
    promptTextTokens: 1e-6,
    completionTextTokens: 4e-6,
    promptCachedTokens: 0,
};
export const FREE_PRICING = {
    promptTextTokens: 0,
    completionTextTokens: 0,
    promptCachedTokens: 0,
};
export const PROMPT_TOKENS = 50;
export const COMPLETION_TOKENS = 10;
/** 50 prompt tokens at 1e-6 plus 10 completion tokens at 4e-6. */
export const COST_PER_QUESTION =
    PROMPT_TOKENS * 1e-6 + COMPLETION_TOKENS * 4e-6;

export function modelFixture(
    name: string,
    fields: Partial<TextModel> = {},
): TextModel {
    return {
        name,
        aliases: [],
        title: name,
        publisher: "test",
        community: name.startsWith("community/"),
        specialized: false,
        health: "healthy",
        pricing: PRICING,
        supportedParameters: [],
        ...fields,
    };
}

export function jsonResponse(
    payload: unknown,
    status = 200,
    headers: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

const SIBLINGS = /Alice has (\d+) brothers and she also has (\d+) sisters?\./;
const COUSINS =
    /Alice has (\d+) sisters?\. Her mother has 1 sister who does not have children - she has (\d+) nephews and nieces and also (\d+) brothers?\. Alice's father has a brother who has (\d+) nephews and nieces in total, and who has also (\d+) sons?\./;
const BOWLS_CONTROL =
    /which is (blue|red), next to this bowl there are (\d+) red bowls? and (\d+) blue bowls? on the table\. How many bowls are on the table beside the big bowl\?/;
const BOWLS_GROUPED =
    /which is (blue|red), there are (\d+) red bowls? and (\d+) blue bowls? on the table\. How many (red|blue) bowls are on the table with red bowls\?/;

/** A stand-in for a model that actually reasons. */
export function solveAiW(prompt: string): number | null {
    const siblings = prompt.match(SIBLINGS);
    if (siblings) {
        return Number(siblings[2]) + 1;
    }
    const cousins = prompt.match(COUSINS);
    if (cousins) {
        const children = Number(cousins[1]) + 1;
        return (
            Number(cousins[2]) -
            children +
            (Number(cousins[4]) - children) +
            Number(cousins[5])
        );
    }
    const control = prompt.match(BOWLS_CONTROL);
    if (control) {
        return Number(control[2]) + Number(control[3]);
    }
    const grouped = prompt.match(BOWLS_GROUPED);
    if (grouped) {
        const asked = grouped[4];
        const matching =
            asked === "red" ? Number(grouped[2]) : Number(grouped[3]);
        return matching + (grouped[1] === asked ? 1 : 0);
    }
    return null;
}

export function chatPayload(content: string): unknown {
    return {
        model: "gpt-6-luna-2026-01-01",
        choices: [
            { message: { role: "assistant", content }, finish_reason: "stop" },
        ],
        usage: {
            prompt_tokens: PROMPT_TOKENS,
            completion_tokens: COMPLETION_TOKENS,
        },
    };
}

export function createFakeServer(config: {
    behaviors?: Record<string, Behavior>;
    bodies?: Record<string, unknown>[];
    balances?: number[];
    catalog?: unknown;
}) {
    const behaviors = config.behaviors ?? {};
    const bodies = config.bodies ?? [];
    let balanceCalls = 0;
    return async (url: string, init?: RequestInit): Promise<Response> => {
        if (url.endsWith("/text/models")) {
            return jsonResponse(config.catalog ?? []);
        }
        if (url.endsWith("/account/balance")) {
            const balances = config.balances ?? [86.81695288, 86.8126];
            const value = balances[Math.min(balanceCalls, balances.length - 1)];
            balanceCalls += 1;
            return jsonResponse({
                balance: value,
                accountBalance: { total: value },
            });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
        >;
        bodies.push(body);
        const behavior = behaviors[String(body.model)] ?? "solve";
        const messages = body.messages as { content: string }[];
        const prompt = messages[0].content;
        if (behavior === "timeout") {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    reject(
                        Object.assign(new Error("aborted"), {
                            name: "AbortError",
                        }),
                    );
                });
            });
        }
        if (behavior === "rate_limited") {
            return new Response("slow down", {
                status: 429,
                headers: { "retry-after": "0" },
            });
        }
        if (behavior === "error") {
            return jsonResponse(
                { error: { message: "provider exploded" } },
                400,
            );
        }
        const answer = behavior === "wrong" ? 0 : solveAiW(prompt);
        return jsonResponse(chatPayload(`### Answer: ${answer ?? 0}`));
    };
}

export function fakeClock(): () => number {
    let value = 0;
    return () => {
        value += 25;
        return value;
    };
}

export const noopSleep = async () => {};
export const noopLog = () => {};
