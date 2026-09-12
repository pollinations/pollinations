import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import type {
    CommunityEndpoint,
    ManagedAgent,
    ProxyCommunityEndpoint,
} from "./src/components/community-endpoints/types";

// Inert owner data behind the real Models and Agents routes.
export function createDeploymentsFixture(query: URLSearchParams) {
    const base = {
        name: "example",
        title: "Example model",
        description: "A preview deployment.",
        requiredSafetyFeatures: [],
        visibility:
            query.get("publisher") === "1"
                ? ("public" as const)
                : ("private" as const),
        pending: null,
        hidden: query.get("hidden") === "1",
        hiddenReason: null,
        hiddenAt: null,
    };
    const model: ProxyCommunityEndpoint = {
        ...base,
        ...communityEndpointPrices({
            promptTextPrice: 0.000001,
            completionTextPrice: 0.000002,
        }),
        id: "preview-model",
        modelId: "preview/example",
        type: "proxy",
        modality: "text",
        api: "chat_completions",
        url: "https://provider.example/v1/chat/completions",
        upstreamModel: "example-model",
        inputModalities: ["text"],
        advertised: { capabilities: [] },
        imagePricing: "request",
        perUserRpm: null,
        paidOnly: false,
        fallbacks: [],
    };
    if (query.get("queued") === "1")
        model.pending = {
            effectiveAt: "2027-01-01T00:00:00Z",
            promptTextPrice: 0.000002,
        };
    let endpoints: CommunityEndpoint[] = [
        model,
        {
            ...base,
            id: "preview-agent",
            modelId: "preview/assistant",
            name: "assistant",
            title: "Example agent",
            type: "prompt_agent",
        },
    ];
    let agents: ManagedAgent[] = [
        {
            ...base,
            id: "preview-agent",
            name: "assistant",
            title: "Example agent",
            systemPrompt: "You are a helpful assistant.",
            baseModel: "openai",
            mcpServers: [],
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: "2026-09-01T00:00:00Z",
        },
    ];
    if (query.get("agent_kind") === "endpoint") {
        endpoints = [
            model,
            {
                ...base,
                id: "preview-endpoint-agent",
                modelId: "preview/endpoint-agent",
                name: "endpoint-agent",
                title: "Endpoint agent",
                type: "endpoint_agent",
                api: "chat_completions",
                url: "https://provider.example/v1/chat/completions",
                upstreamModel: "example-agent",
                perUserRpm: null,
            },
        ];
        agents = [];
    }
    if (query.get("collection_case") === "empty") {
        endpoints = [];
        agents = [];
    }
    let sequence = 0;
    let active = /^dash-(models|agents)/.test(query.get("screen") ?? "");
    let provider = {
        name: "Example provider",
        url: "https://provider.example",
    };
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    return (url: URL, method: string, body: Record<string, unknown>) => {
        if (active && url.pathname === "/models")
            return json([
                {
                    name: "openai",
                    title: "Example text model",
                    type: "text",
                    input_modalities: ["text"],
                    output_modalities: ["text"],
                },
            ]);
        const models = url.pathname.startsWith("/api/account/my-models");
        const agent = url.pathname.startsWith("/api/account/agents");
        if (!models && !agent) return;
        active = true;
        if (method === "GET") {
            if (url.pathname.endsWith("/fallback-candidates"))
                return json({ data: [] });
            if (query.get("collection_case") === "loading")
                return new Promise<Response>(() => {});
            if (query.get("collection_case") === "error") {
                query.delete("collection_case");
                return json(
                    {
                        error: {
                            message: "Couldn’t load this list. Try again.",
                        },
                    },
                    503,
                );
            }
            return json(
                agent ? { data: agents } : { data: endpoints, provider },
            );
        }
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (query.get("result") === "error") {
            query.delete("result");
            return json(
                { error: { message: "Request failed. Try again." } },
                503,
            );
        }
        if (url.pathname.endsWith("/test"))
            return json({
                ok: true,
                message: "Endpoint responded",
                usage: { prompt_tokens: 10, completion_tokens: 5 },
                billableUsage: {
                    promptTextTokens: 10,
                    completionTextTokens: 5,
                },
            });
        if (url.pathname.endsWith("/models"))
            return json({ data: ["example-model"] });
        if (url.pathname.endsWith("/provider")) {
            provider = { ...provider, ...body };
            return json(provider);
        }
        const id = url.pathname.split("/")[4];
        if (method === "DELETE") {
            endpoints = endpoints.filter((e) => e.id !== id);
            agents = agents.filter((e) => e.id !== id);
            return json({ success: true });
        }
        if (id) {
            endpoints = endpoints.map((e) =>
                e.id === id ? ({ ...e, ...body } as CommunityEndpoint) : e,
            );
            agents = agents.map((e) =>
                e.id === id ? ({ ...e, ...body } as ManagedAgent) : e,
            );
            return json(endpoints.find((e) => e.id === id));
        }
        const createdId = `preview-created-${++sequence}`;
        const created = {
            ...(agent ? base : model),
            ...body,
            id: createdId,
            modelId: `preview/${body.name}`,
            type: agent ? "prompt_agent" : "proxy",
        } as CommunityEndpoint;
        endpoints = [...endpoints, created];
        if (agent)
            agents = [
                ...agents,
                {
                    ...agents[0],
                    ...base,
                    ...body,
                    id: createdId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                } as ManagedAgent,
            ];
        return json(created);
    };
}
