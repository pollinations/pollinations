import type { ApiKey } from "./src/components/keys/types";

// Inert owner data for the real dashboard routes. No key or billing write leaves the preview.
export function createDashboardFixture(query: URLSearchParams) {
    let createdCount = 0;
    let keys: ApiKey[] =
        query.get("keys_empty") === "1" ||
        query.get("collection_case") === "empty"
            ? []
            : [
                  {
                      id: "preview-connection",
                      name: "App example",
                      start: "sk_preview",
                      byopClientKeyId: "preview-client",
                      metadata: { keyType: "secret" },
                  },
                  {
                      id: "preview-secret",
                      name: "My API key",
                      start: "sk_preview",
                      metadata: { keyType: "secret" },
                  },
                  {
                      id: "preview-registration",
                      name: "My app",
                      start: "pk_preview",
                      metadata: {
                          keyType: "publishable",
                          redirectUris: ["https://app.example/callback"],
                          earningsEnabled: true,
                      },
                  },
              ].map((key) => ({
                  ...key,
                  enabled: true,
                  createdAt: "2026-09-01T00:00:00Z",
                  pollenBalance: 5,
                  permissions: { account: ["profile"] },
              }));
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    return (url: URL, method: string, body: Record<string, unknown>) => {
        if (method === "GET" && url.pathname === "/models") {
            if (query.get("model_catalog") === "loading")
                return new Promise<Response>(() => {});
            if (query.get("model_catalog") === "error") {
                query.delete("model_catalog");
                return json(
                    { message: "Couldn’t load models. Try again." },
                    503,
                );
            }
            return json([
                {
                    name: "openai",
                    title: "Example text model",
                    description: "Text generation for the preview.",
                    category: "text",
                    input_modalities: ["text"],
                    output_modalities: ["text"],
                    pricing: {
                        promptTextTokens: 0.000001,
                        completionTextTokens: 0.000002,
                    },
                    capabilities: [],
                },
                {
                    name: "preview-image",
                    title: "Example image model",
                    description: "Image generation for the preview.",
                    category: "image",
                    input_modalities: ["text"],
                    output_modalities: ["image"],
                    pricing: { completionImageTokens: 0.02 },
                    capabilities: [],
                },
            ]);
        }
        if (
            method === "GET" &&
            ["/api/api-keys", "/api/customer/balance"].includes(url.pathname)
        ) {
            if (query.get("account_case") === "loading")
                return new Promise<Response>(() => {});
            if (query.get("account_case") === "load-error") {
                query.delete("account_case");
                return json(
                    { message: "Couldn’t load account data. Try again." },
                    503,
                );
            }
            if (url.pathname === "/api/api-keys") return json({ data: keys });
        }
        const create = method === "POST" && url.pathname === "/api/api-keys";
        const update =
            method === "POST" &&
            /^\/api\/api-keys\/[^/]+\/(update|metadata)$/.test(url.pathname);
        const remove =
            method === "POST" && url.pathname === "/api/auth/api-key/delete";
        if (!create && !update && !remove) return;
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (query.get("result") === "error") {
            query.delete("result");
            return json(
                {
                    message: "Request failed. Try again.",
                    error: { message: "Request failed. Try again." },
                },
                503,
            );
        }
        if (create) {
            const key: ApiKey = {
                id: `preview-created-${++createdCount}`,
                name: String(body.name),
                start: "preview",
                createdAt: new Date().toISOString(),
                enabled: true,
                metadata: body.metadata as ApiKey["metadata"],
                pollenBalance: body.pollenBudget as number,
                permissions: {
                    account: body.accountPermissions as string[],
                    models: body.allowedModels as string[],
                },
            };
            keys = [key, ...keys];
            return json({ ...key, key: "preview-only-not-a-valid-credential" });
        }
        if (remove) keys = keys.filter((key) => key.id !== body.keyId);
        if (update)
            keys = keys.map((key) =>
                key.id !== url.pathname.split("/")[3]
                    ? key
                    : url.pathname.endsWith("/metadata")
                      ? { ...key, metadata: { ...key.metadata, ...body } }
                      : {
                            ...key,
                            name: body.name as string,
                            pollenBalance: body.pollenBudget as number,
                            expiresAt: body.expiresAt as string | null,
                            permissions: {
                                account: body.accountPermissions as string[],
                                models: body.allowedModels as string[],
                            },
                        },
            );
        return json({ success: true });
    };
}
