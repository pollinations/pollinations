import { EditableCombobox } from "@pollinations/ui";
import { communityEndpointPrices } from "@shared/community-endpoints.ts";
import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { CommunityEndpointDialog } from "../frontend/src/components/community-endpoints/community-endpoint-dialog.tsx";
import type {
    EndpointPayload,
    ProxyCommunityEndpoint,
} from "../frontend/src/components/community-endpoints/types.ts";

vi.mock("@ark-ui/react/portal", () => ({
    Portal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@pollinations/ui", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@pollinations/ui")>()),
    Dialog: ({ children }: { children: ReactNode }) => children,
    DialogHeader: () => null,
    EditableCombobox: () => null,
}));
vi.mock("../frontend/src/config.ts", () => ({
    config: { apiBaseUrl: "/api", genBaseUrl: "https://gen.example" },
    genDocsUrl: () => "https://gen.example/docs",
}));
vi.mock("../frontend/src/api.ts", () => ({
    accountClient: {
        "my-models": {
            ":id": {
                "fallback-candidates": {
                    $get: async () => Response.json({ data: [] }),
                },
            },
        },
    },
}));

it("saves a provider model change under the existing public ID", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const endpoint: ProxyCommunityEndpoint = {
        ...communityEndpointPrices({}),
        type: "proxy",
        id: "endpoint-1",
        modelId: "community/alice/llama",
        name: "llama",
        title: "Llama",
        description: null,
        requiredSafetyFeatures: [],
        visibility: "public",
        pending: null,
        imagePricing: "request",
        inputModalities: ["text"],
        advertised: {},
        perUserRpm: null,
        paidOnly: false,
        fallbacks: [],
        upstreamModel: "llama",
        modality: "text",
        api: "chat_completions",
        url: "https://provider.example/v1",
    };
    let saved: EndpointPayload | undefined;
    let renderer: ReactTestRenderer | undefined;
    try {
        await act(async () => {
            renderer = create(
                <CommunityEndpointDialog
                    endpoint={endpoint}
                    canPublish
                    fallbackOptions={[]}
                    open
                    onOpenChange={vi.fn()}
                    onSubmit={async (payload) => {
                        saved = payload;
                    }}
                />,
            );
        });
        const providerModel = renderer?.root.find(
            (node) =>
                node.type === EditableCombobox &&
                node.props.name === "community-upstream-id",
        );
        await act(async () => providerModel?.props.onChange("llama-v2"));
        await act(async () =>
            renderer?.root.findByType("form").props.onSubmit({
                preventDefault: vi.fn(),
            }),
        );
        expect(saved?.name).toBe("llama");
        expect(saved?.upstreamModel).toBe("llama-v2");
    } finally {
        await act(async () => renderer?.unmount());
        vi.unstubAllGlobals();
    }
});
