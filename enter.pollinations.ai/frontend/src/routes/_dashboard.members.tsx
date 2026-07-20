import { Button, Section, Surface } from "@pollinations/ui";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../api.ts";
import {
    InviteMemberForm,
    MemberList,
    type MemberPermissions,
    OrganizationDeleteConfirmation,
    type OrganizationMember,
} from "../components/organizations";
import {
    getActiveOrganizationId,
    setActiveOrganizationId,
} from "../lib/active-organization.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/members")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    loader: async () => {
        const organizationId = getActiveOrganizationId();
        if (!organizationId) {
            return {
                organizationId: null,
                members: [] as OrganizationMember[],
            };
        }
        const response = await apiClient.organizations[":id"].members.$get({
            param: { id: organizationId },
        });
        if (!response.ok) {
            return { organizationId, members: [] as OrganizationMember[] };
        }
        const { data } = await response.json();
        return { organizationId, members: data as OrganizationMember[] };
    },
    component: MembersPage,
});

function MembersPage() {
    const { organizations } = DashboardRoute.useLoaderData();
    const { organizationId, members } = Route.useLoaderData();
    const router = useRouter();
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const organization = organizations.find((org) => org.id === organizationId);

    if (!organizationId || !organization) {
        return (
            <Section title="Members" framed>
                <Surface className="p-6 text-center">
                    <p className="text-sm text-theme-text-muted">
                        Select or create an organization from the account
                        switcher to manage its members.
                    </p>
                </Surface>
            </Section>
        );
    }

    const isOwner = organization.role === "owner";

    async function handleInvite(
        githubUsername: string,
        permissions: MemberPermissions,
    ): Promise<void> {
        const response = await apiClient.organizations[":id"].members.$post({
            param: { id: organizationId as string },
            json: { githubUsername, ...permissions },
        });
        if (!response.ok) {
            const err = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;
            throw new Error(err?.message || "Failed to invite member");
        }
        await router.invalidate();
    }

    async function handleUpdatePermissions(
        memberId: string,
        permissions: MemberPermissions,
    ): Promise<void> {
        await apiClient.organizations[":id"].members[":memberId"].$patch({
            param: { id: organizationId as string, memberId },
            json: permissions,
        });
        await router.invalidate();
    }

    async function handleRemoveMember(memberId: string): Promise<void> {
        await apiClient.organizations[":id"].members[":memberId"].$delete({
            param: { id: organizationId as string, memberId },
        });
        await router.invalidate();
    }

    async function handleLeave(): Promise<void> {
        await apiClient.organizations[":id"].leave.$post({
            param: { id: organizationId as string },
        });
        setActiveOrganizationId(null);
        await router.invalidate();
    }

    async function handleDeleteOrganization(): Promise<void> {
        await apiClient.organizations[":id"].$delete({
            param: { id: organizationId as string },
        });
        setActiveOrganizationId(null);
        setIsDeleteConfirmOpen(false);
        await router.invalidate();
    }

    return (
        <div className="flex flex-col gap-6">
            <Section
                title={organization.name}
                framed
                action={
                    isOwner ? (
                        <Button
                            type="button"
                            intent="danger"
                            onClick={() => setIsDeleteConfirmOpen(true)}
                        >
                            Delete organization
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            intent="danger"
                            onClick={handleLeave}
                        >
                            Leave organization
                        </Button>
                    )
                }
            >
                <p className="text-sm text-theme-text-muted">
                    Paid Pollen balance: {organization.packBalance}
                </p>
            </Section>

            {isOwner && (
                <Section title="Invite a member" framed>
                    <InviteMemberForm onInvite={handleInvite} />
                </Section>
            )}

            <Section title="Members" framed>
                <MemberList
                    members={members}
                    isOwner={isOwner}
                    onUpdatePermissions={handleUpdatePermissions}
                    onRemoveMember={handleRemoveMember}
                />
            </Section>

            <OrganizationDeleteConfirmation
                organizationName={organization.name}
                open={isDeleteConfirmOpen}
                onConfirm={handleDeleteOrganization}
                onCancel={() => setIsDeleteConfirmOpen(false)}
            />
        </div>
    );
}
