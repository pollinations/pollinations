import { Section } from "@pollinations/ui";
import {
    Await,
    createFileRoute,
    redirect,
    useRouter,
} from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { authClient } from "../auth.ts";
import {
    ApiKeyList,
    type ApiKeyUpdateParams,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/keys";
import {
    DashboardLoading,
    LoadError,
} from "../components/layout/dashboard-loading.tsx";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";
import { updateApiKey } from "../lib/update-api-key.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/keys")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: KeysPage,
});

function KeysPage() {
    const router = useRouter();
    const { apiKeys } = useDeferredValue(DashboardRoute.useLoaderData());

    async function handleCreateApiKey(
        formState: CreateApiKey,
    ): Promise<CreateApiKeyResponse> {
        const keyType = formState.keyType || "secret";
        const isPublishable = keyType === "publishable";
        const created = await createKeyWithPermissions({
            name: formState.name,
            prefix: isPublishable ? "pk" : "sk",
            expiryDays: formState.expiryDays,
            metadata: {
                description: formState.description,
                keyType,
                ...(isPublishable && formState.redirectUris?.length
                    ? { redirectUris: formState.redirectUris }
                    : {}),
                ...(isPublishable
                    ? { earningsEnabled: formState.earningsEnabled === true }
                    : {}),
            },
            permissions: {
                allowedModels: formState.allowedModels,
                pollenBudget: formState.pollenBudget,
                accountPermissions: formState.accountPermissions?.length
                    ? formState.accountPermissions
                    : undefined,
            },
        });

        await router.invalidate();
        return {
            id: created.id,
            key: created.key,
            name: created.name,
        } as CreateApiKeyResponse;
    }

    async function handleDeleteApiKey(id: string): Promise<void> {
        const result = await authClient.apiKey.delete({ keyId: id });
        if (result.error)
            throw new Error(result.error.message || "Request failed");
        await router.invalidate();
    }

    async function handleUpdateApiKey(
        id: string,
        updates: ApiKeyUpdateParams,
    ): Promise<void> {
        await updateApiKey(id, updates);
        await router.invalidate();
    }

    return (
        <Await
            promise={apiKeys}
            fallback={
                <div className="flex flex-col gap-6">
                    <DashboardLoading
                        title="Secrets"
                        label="Loading secret keys…"
                    />
                    <DashboardLoading title="Apps" label="Loading app keys…" />
                </div>
            }
        >
            {(keys) =>
                keys ? (
                    <ApiKeyList
                        apiKeys={keys}
                        onCreate={handleCreateApiKey}
                        onUpdate={handleUpdateApiKey}
                        onDelete={handleDeleteApiKey}
                    />
                ) : (
                    <div className="flex flex-col gap-6">
                        {["Secrets", "Apps"].map((title) => (
                            <Section key={title} title={title}>
                                <LoadError>Couldn’t load keys.</LoadError>
                            </Section>
                        ))}
                    </div>
                )
            }
        </Await>
    );
}
