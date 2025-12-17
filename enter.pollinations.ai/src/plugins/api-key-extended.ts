import { apiKey } from "better-auth/plugins";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

/**
 * Extended API Key plugin that allows setting permissions from HTTP endpoints.
 *
 * The base better-auth apiKey plugin marks `permissions` as server-only,
 * meaning it can only be set via `auth.api.updateApiKey()` and not from
 * HTTP requests to `/api/auth/api-key/update`.
 *
 * This extended plugin adds a new endpoint `/api/auth/api-key/update-permissions`
 * that calls the base updateApiKey endpoint internally (as a server-side call),
 * bypassing the SERVER_ONLY restriction.
 */
export const apiKeyExtended = (
    options?: Parameters<typeof apiKey>[0],
): BetterAuthPlugin => {
    const basePlugin = apiKey(options);

    return {
        ...basePlugin,
        id: "api-key-extended",

        endpoints: {
            ...basePlugin.endpoints,

            // Add new endpoint that allows permissions updates from HTTP
            updateApiKeyPermissions: createAuthEndpoint(
                "/api-key/update-permissions",
                {
                    method: "POST",
                    use: [sessionMiddleware],
                    body: z.object({
                        keyId: z.string(),
                        permissions: z
                            .record(z.string(), z.array(z.string()))
                            .nullable()
                            .optional(),
                    }),
                    metadata: {
                        openapi: {
                            summary: "Update API key permissions",
                            description:
                                "Update the permissions of an API key. Requires session authentication.",
                            tags: ["API Key"],
                        },
                    },
                },
                async (ctx) => {
                    const { keyId, permissions } = ctx.body;

                    // Call the base updateApiKey endpoint as a server-side call
                    // This bypasses the SERVER_ONLY check for permissions
                    const result = await basePlugin.endpoints.updateApiKey({
                        ...ctx,
                        body: {
                            keyId,
                            permissions,
                        },
                    });

                    return result;
                },
            ),
        },
    } satisfies BetterAuthPlugin;
};
