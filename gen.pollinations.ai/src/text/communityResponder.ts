import { account, user } from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { ChatCompletion } from "./types.ts";

const DISCORD_SNOWFLAKE = /^[1-9]\d{16,19}$/;

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

/** Stable for one caller and endpoint, opaque to the community service. */
export async function humanCallerId(
    secret: string,
    endpointId: string,
    userId: string,
): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`human-caller:v1:${endpointId}:${userId}`),
    );
    return `hc_${bytesToBase64Url(new Uint8Array(signature))}`;
}

export function humanResponderDiscordId(completion: unknown): string | null {
    if (!completion || typeof completion !== "object") return null;
    const metadata = (completion as { _pollinations?: unknown })._pollinations;
    if (!metadata || typeof metadata !== "object") return null;
    const responder = (metadata as { responder?: unknown }).responder;
    if (!responder || typeof responder !== "object") return null;
    const discordId = (responder as { discordId?: unknown }).discordId;
    return typeof discordId === "string" && DISCORD_SNOWFLAKE.test(discordId)
        ? discordId
        : null;
}

export type HumanCompletionValidation =
    | { discordId: string }
    | { error: string };

export function validateHumanResponderCompletion(
    completion: ChatCompletion,
): HumanCompletionValidation {
    if (!Array.isArray(completion.choices) || completion.choices.length !== 1) {
        return {
            error: "Human responder returned an invalid number of choices",
        };
    }
    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
        return { error: "Human responder returned an invalid text response" };
    }

    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;
    const totalTokens = completion.usage?.total_tokens;
    if (
        !Number.isInteger(promptTokens) ||
        (promptTokens as number) < 0 ||
        !Number.isInteger(completionTokens) ||
        (completionTokens as number) <= 0 ||
        !Number.isInteger(totalTokens) ||
        totalTokens !== (promptTokens as number) + (completionTokens as number)
    ) {
        return { error: "Human responder returned invalid token usage" };
    }

    const discordId = humanResponderDiscordId(completion);
    if (!discordId) {
        return { error: "Human responder identity is missing or invalid" };
    }
    return { discordId };
}

export function stripHumanResponderMetadata<T>(completion: T): T {
    if (!completion || typeof completion !== "object") return completion;
    delete (completion as T & { _pollinations?: unknown })._pollinations;
    return completion;
}

export async function resolveHumanResponderUserId(
    dbBinding: D1Database,
    discordId: string,
): Promise<string | null> {
    if (!DISCORD_SNOWFLAKE.test(discordId)) return null;

    const db = drizzle(dbBinding);
    const rows = await db
        .select({
            userId: account.userId,
            banned: user.banned,
            banExpires: user.banExpires,
        })
        .from(account)
        .innerJoin(user, eq(account.userId, user.id))
        .where(
            and(
                eq(account.providerId, "discord"),
                eq(account.accountId, discordId),
            ),
        )
        .limit(2);

    if (rows.length !== 1) return null;
    const [linked] = rows;
    const activelyBanned =
        linked.banned === true &&
        (!linked.banExpires || linked.banExpires.getTime() > Date.now());
    return activelyBanned ? null : linked.userId;
}
