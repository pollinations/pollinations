import { expect, it } from "vitest";
import { sandboxError } from "../frontend/src/components/sandbox-error.ts";

const origin = "https://enter.pollinations.ai";
const edit = `/edit-key?${new URLSearchParams({ id: "example/key" })}`;

it.each([
    [
        "KEY_BUDGET_EXHAUSTED",
        "remaining budget",
        "Review key budget",
        edit,
        "agent_key_budget",
    ],
    [
        "QUEST_POLLEN_ONLY",
        "Quest balance",
        "Allow paid balance",
        edit,
        "agent_quest_pollen_only",
    ],
    [
        "QUEST_POLLEN_RESTRICTED",
        "locked",
        "Top up",
        "/top-up",
        "quest_pollen_restricted",
    ],
    [
        "INSUFFICIENT_BALANCE",
        "your paid balance",
        "Top up paid balance",
        "/top-up",
        "agent_low_balance_topup",
    ],
])(
    "shows one owner action for %s",
    async (reason, phrase, label, basePath, ref) => {
        const href = `${basePath}${basePath === edit ? "&" : "?"}ref=${ref}`;
        const response = Response.json(
            {
                code: 402,
                reason,
                message: "Detailed API instructions with links.",
                fixUrl: `${origin}${href}&redirect=https://example.org&unrelated=1`,
            },
            { status: 402 },
        );
        const error = await sandboxError(response, origin);
        expect(error.message).toContain(phrase);
        expect(error.message).not.toContain("Detailed API instructions");
        expect(error.recovery).toEqual({ label, href });
    },
);

it.each([
    "https://example.org/edit-key?id=x",
    "/top-up?id=x",
    "/edit-key",
    "javascript:alert(1)",
])("falls back to the key list for an unusable edit link", async (fixUrl) => {
    const response = Response.json(
        { code: 402, reason: "KEY_BUDGET_EXHAUSTED", message: "Raw", fixUrl },
        { status: 402 },
    );
    expect((await sandboxError(response, origin)).recovery?.href).toBe("/keys");
});

it.each([402, 503])(
    "preserves an unrecognized provider error (%s)",
    async (status) => {
        const response = Response.json(
            {
                code: status,
                reason: "PROVIDER_ERROR",
                message: "Provider message",
            },
            { status },
        );
        const error = await sandboxError(response, origin);
        expect(error.message).toBe("Provider message");
        expect(error.recovery).toBeUndefined();
    },
);
