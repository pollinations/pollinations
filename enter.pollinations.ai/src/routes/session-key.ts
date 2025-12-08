import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";

export const sessionKeyRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: [
                "Get a temporary API key from the current session.",
                "This endpoint is used by gen.pollinations.ai to authenticate users via their session.",
                "Returns the user's first publishable API key, or creates one if none exists.",
            ].join(" "),
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const authClient = c.var.auth.client;

            try {
                // List all API keys for the user
                const apiKeysResult = await authClient.api.listApiKeys({
                    headers: c.req.raw.headers,
                });

                if (!apiKeysResult || !apiKeysResult.data) {
                    throw new HTTPException(500, {
                        message: "Failed to retrieve API keys",
                    });
                }

                // Find a publishable key (pk_ prefix)
                const publishableKey = apiKeysResult.data.find(
                    (key) => key.prefix === "plln_pk" && key.enabled
                );

                if (publishableKey && publishableKey.metadata?.plaintextKey) {
                    // Return existing publishable key
                    return c.json({
                        key: publishableKey.metadata.plaintextKey as string,
                        keyId: publishableKey.id,
                        name: publishableKey.name || "Session Key",
                        type: "publishable",
                    });
                }

                // No publishable key found, create one
                const createResult = await authClient.api.createApiKey({
                    body: {
                        name: "Auto-generated Session Key",
                        prefix: "plln_pk",
                        metadata: {
                            description: "Automatically created from session",
                            keyType: "publishable",
                        },
                    },
                    headers: c.req.raw.headers,
                });

                if (!createResult || !createResult.data) {
                    throw new HTTPException(500, {
                        message: "Failed to create API key",
                    });
                }

                const newKey = createResult.data;

                // Store plaintext key in metadata for future retrieval
                await authClient.api.updateApiKey({
                    body: {
                        keyId: newKey.id,
                        metadata: {
                            plaintextKey: newKey.key,
                            description: "Automatically created from session",
                            keyType: "publishable",
                        },
                    },
                    headers: c.req.raw.headers,
                });

                return c.json({
                    key: newKey.key,
                    keyId: newKey.id,
                    name: newKey.name || "Session Key",
                    type: "publishable",
                });
            } catch (e) {
                if (e instanceof HTTPException) throw e;
                throw new HTTPException(500, { cause: e });
            }
        }
    );

export type SessionKeyRoutes = typeof sessionKeyRoutes;
