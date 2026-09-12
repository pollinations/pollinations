import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/keys";
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
    return <KeyManagement kind="keys" />;
}

export function KeyManagement({ kind }: { kind: "keys" | "apps" }) {
    const router = useRouter();
    const { apiKeys } = DashboardRoute.useLoaderData();

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
            throw new Error("Couldn’t delete this key. Try again.");
        await router.invalidate();
    }

    async function handleUpdateApiKey(
        id: string,
        updates: {
            name?: string;
            allowedModels?: string[] | null;
            pollenBudget?: number | null;
            accountPermissions?: string[] | null;
            expiresAt?: Date | null;
        },
    ): Promise<void> {
        await updateApiKey(id, updates);
        await router.invalidate();
    }

    return (
        <ApiKeyList
            kind={kind}
            apiKeys={apiKeys}
            onCreate={handleCreateApiKey}
            onUpdate={handleUpdateApiKey}
            onDelete={handleDeleteApiKey}
        />
    );
}
