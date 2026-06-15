import {
    Button,
    Section,
    SproutIcon,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { CommunityEndpointCard } from "./community-endpoint-card.tsx";
import { CommunityEndpointDeleteConfirmation } from "./community-endpoint-delete-confirmation.tsx";
import { CommunityEndpointDialog } from "./community-endpoint-dialog.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    type CommunityEndpointTestResponse,
    type EndpointPayload,
    readError,
} from "./types.ts";

type CommunityEndpointsProps = {
    onChange?: () => void | Promise<void>;
};

export function CommunityEndpoints({ onChange }: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<CommunityEndpoint | null>(null);
    const [deleting, setDeleting] = useState<CommunityEndpoint | null>(null);
    const [endpointTests, setEndpointTests] = useState<
        Record<string, ActionState>
    >({});

    const loadEndpoints = useCallback(async (): Promise<void> => {
        setError(null);
        const response = await apiClient["community-endpoints"].$get();
        if (!response.ok) {
            setError(await readError(response));
            setIsLoading(false);
            return;
        }
        const body = (await response.json()) as { data: CommunityEndpoint[] };
        setEndpoints(body.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadEndpoints();
    }, [loadEndpoints]);

    async function handleCreate(
        payload: EndpointPayload,
        bearerToken: string,
    ): Promise<void> {
        const response = await apiClient["community-endpoints"].$post({
            json: { ...payload, bearerToken },
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleUpdate(
        payload: EndpointPayload,
        bearerToken: string,
    ): Promise<void> {
        if (!editing) return;
        const response = await apiClient["community-endpoints"][
            ":id"
        ].update.$post({
            param: { id: editing.id },
            json: bearerToken ? { ...payload, bearerToken } : payload,
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleDelete(): Promise<void> {
        if (!deleting) return;
        const target = deleting;
        setDeleting(null);
        setError(null);
        try {
            const response = await apiClient["community-endpoints"][
                ":id"
            ].$delete({ param: { id: target.id } });
            if (!response.ok) throw new Error(await readError(response));
            await loadEndpoints();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint delete failed",
            );
        }
    }

    async function handleTest(endpoint: CommunityEndpoint): Promise<void> {
        setEndpointTests((current) => ({
            ...current,
            [endpoint.id]: { status: "loading", message: "Testing…" },
        }));
        try {
            const response = await apiClient["community-endpoints"][
                ":id"
            ].test.$post({
                param: { id: endpoint.id },
                json: {
                    baseUrl: endpoint.baseUrl,
                    model: endpoint.upstreamModel,
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body =
                (await response.json()) as CommunityEndpointTestResponse;
            setEndpointTests((current) => ({
                ...current,
                [endpoint.id]: {
                    status: "success",
                    message: body.message || "Endpoint responded",
                    usage: body.usage,
                    billableUsage: body.billableUsage,
                },
            }));
        } catch (thrown) {
            setEndpointTests((current) => ({
                ...current,
                [endpoint.id]: {
                    status: "error",
                    message:
                        thrown instanceof Error
                            ? thrown.message
                            : "Endpoint test failed",
                },
            }));
        }
    }

    return (
        <>
            <Section
                title="My Models"
                framed
                action={
                    <CommunityEndpointDialog
                        open={createOpen}
                        onOpenChange={setCreateOpen}
                        onSubmit={handleCreate}
                        trigger={
                            <Button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap"
                            >
                                <SproutIcon className="h-4 w-4" />
                                Add Model
                            </Button>
                        }
                    />
                }
            >
                {error && (
                    <p className="mb-3 rounded-lg bg-intent-danger-bg-light px-3 py-2 text-sm text-intent-danger-text">
                        {error}
                    </p>
                )}
                <div className="flex flex-col gap-3">
                    {isLoading ? (
                        <Surface className="p-6 text-center text-sm text-theme-text-muted">
                            Loading…
                        </Surface>
                    ) : endpoints.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <SproutIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Register your first model
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                Expose an OpenAI-compatible endpoint as a
                                community model with your own per-1M-token
                                pricing.
                            </p>
                        </Surface>
                    ) : (
                        endpoints.map((endpoint) => (
                            <CommunityEndpointCard
                                key={endpoint.id}
                                endpoint={endpoint}
                                testState={endpointTests[endpoint.id]}
                                onTest={() => void handleTest(endpoint)}
                                onEdit={() => setEditing(endpoint)}
                                onDelete={() => setDeleting(endpoint)}
                            />
                        ))
                    )}
                </div>
                <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Published community models appear in{" "}
                        <strong>/models</strong> and are billed to callers at
                        your per-1M-token pricing.
                    </span>
                </p>
            </Section>

            <CommunityEndpointDialog
                endpoint={editing ?? undefined}
                open={!!editing}
                onOpenChange={(open) => !open && setEditing(null)}
                onSubmit={handleUpdate}
            />

            <CommunityEndpointDeleteConfirmation
                endpoint={deleting}
                onConfirm={() => void handleDelete()}
                onCancel={() => setDeleting(null)}
            />
        </>
    );
}
