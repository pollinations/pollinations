import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { apiClient } from "../api.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/keys";
import { useActiveOrganizationId } from "../lib/active-organization.ts";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";
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
    const { apiKeys, organizations } = DashboardRoute.useLoaderData();
    const activeOrganizationId = useActiveOrganizationId();
    const activeOrganization = organizations.find(
        (org) => org.id === activeOrganizationId,
    );
    // Any member (including read-only) can view an org's keys, but only the
    // owner or a member with canManageApiKeys may create/edit/delete them.
    const canManage =
        !activeOrganizationId || !!activeOrganization?.canManageApiKeys;

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
            organizationId: activeOrganizationId ?? undefined,
        });

        await router.invalidate();
        return {
            id: created.id,
            key: created.key,
            name: created.name,
        } as CreateApiKeyResponse;
    }

    async function handleDeleteApiKey(id: string): Promise<void> {
        // First-party route (not authClient.apiKey.delete): org-owned keys
        // can be deleted by any manager, not just the member who created
        // them, which better-auth's own userId-matching delete can't allow.
        const response = await apiClient["api-keys"][":id"].delete.$post({
            param: { id },
        });
        if (!response.ok) {
            const error = await response.json().catch(() => null);
            console.error(
                (error as { message?: string } | null)?.message ||
                    "Failed to delete key",
            );
        }
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
        const response = await apiClient["api-keys"][":id"].update.$post({
            param: { id },
            json: {
                ...updates,
                expiresAt:
                    updates.expiresAt instanceof Date
                        ? updates.expiresAt.toISOString()
                        : updates.expiresAt,
            },
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                (error as { message?: string }).message || "Update failed",
            );
        }
        await router.invalidate();
    }

    return (
        <ApiKeyList
            apiKeys={apiKeys}
            onCreate={handleCreateApiKey}
            onUpdate={handleUpdateApiKey}
            onDelete={handleDeleteApiKey}
            canManage={canManage}
        />
    );
}
