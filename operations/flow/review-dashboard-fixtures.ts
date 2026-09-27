import type { D1Database } from "@cloudflare/workers-types";
import {
    PROMPT_AGENT_BASE_URL_PLACEHOLDER,
    PromptAgentConfigSchema,
    ProxyListingPayloadSchema,
} from "../../shared/community-endpoints.ts";
import { CLIENT_KEY_ID, USER_ID } from "./fixtures";
import { ENTER_ORIGIN } from "./local-origins";

// These are database records for viewing real management pages, not credentials.
// An impossible hash and no plaintext ensure no fixture key can authenticate.
const keyIds = ["flow-review-key", "flow-review-app"] as const;
const listingIds = ["flow-review-model", "flow-review-agent"] as const;

export async function prepareDashboardReview(
    db: D1Database,
    selection: "populated" | "empty",
    enterOrigin = ENTER_ORIGIN,
) {
    await db.batch([
        db
            .prepare("DELETE FROM apikey WHERE id IN (?, ?) AND user_id = ?")
            .bind(...keyIds, USER_ID),
        db
            .prepare(
                "DELETE FROM community_endpoint WHERE id IN (?, ?) AND owner_user_id = ?",
            )
            .bind(...listingIds, USER_ID),
    ]);
    if (selection === "empty") return;
    const conditions = await db
        .prepare("SELECT allowance FROM flow_conditions WHERE id = 1")
        .first<{ allowance: string }>();
    const now = Math.floor(Date.now() / 1000);
    const modelPayload = ProxyListingPayloadSchema.parse({
        bearerTokenCiphertext: "invalid-review-ciphertext-no-credential",
        api: "chat_completions",
        modality: "text",
        imagePricing: "request",
        inputModalities: ["text"],
        perUserRpm: null,
        fallbacks: [],
        prices: {},
    });
    const agentPayload = PromptAgentConfigSchema.parse({
        systemPrompt: "Answer clearly and concisely.",
        baseModel: "openai",
        mcpServers: [],
    });
    await db.batch([
        ...keyIds.map((id, index) =>
            db
                .prepare(`INSERT INTO apikey
            (id, name, start, prefix, key, user_id, enabled,
             rate_limit_enabled, request_count, pollen_balance,
             permissions, metadata, byop_client_key_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?, ?, ?, ?)`)
                .bind(
                    id,
                    index ? "Example app registration" : "App example",
                    index ? "pk_preview" : "sk_preview",
                    index ? "pk" : "sk",
                    `invalid hash: ${id}`,
                    USER_ID,
                    conditions?.allowance === "exhausted" ? 0 : 5,
                    JSON.stringify({
                        models: null,
                        account: ["profile", "usage", "keys"],
                    }),
                    JSON.stringify(
                        index
                            ? {
                                  keyType: "publishable",
                                  redirectUris: [
                                      `${enterOrigin}/flow-example.html`,
                                  ],
                                  earningsEnabled: false,
                              }
                            : {
                                  keyType: "secret",
                                  createdVia: "flow-review",
                              },
                    ),
                    index ? null : CLIENT_KEY_ID,
                    now,
                    now,
                ),
        ),
        ...listingIds.map((id, index) =>
            db
                .prepare(`INSERT INTO community_endpoint
            (id, owner_user_id, name, title, description, type, base_url,
             upstream_model, required_safety_features, payload, visibility, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'private', ?, ?)`)
                .bind(
                    id,
                    USER_ID,
                    index ? "example-agent" : "example-model",
                    index ? "Example agent" : "Example model",
                    index
                        ? "A personal assistant."
                        : "A private model endpoint.",
                    index ? "prompt_agent" : "proxy",
                    index
                        ? PROMPT_AGENT_BASE_URL_PLACEHOLDER
                        : "https://flow-review.invalid/v1",
                    index ? id : "example-model",
                    JSON.stringify(index ? agentPayload : modelPayload),
                    now,
                    now,
                ),
        ),
    ]);
}
