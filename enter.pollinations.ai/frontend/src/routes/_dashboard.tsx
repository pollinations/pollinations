import { Button, GitHubIcon } from "@pollinations/ui";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { ApiKey } from "../components/keys";
import { DashboardShell } from "../components/layout/dashboard-shell.tsx";
import {
    PERSONAL_NAV_ITEMS,
    SIGNED_OUT_NAV_ITEMS,
} from "../components/layout/dashboard-theme.ts";
import {
    AccountSwitcher,
    type OrganizationSummary,
    type PendingInvitation,
    PendingInvitationsList,
} from "../components/organizations";
import { SidebarWallet } from "../components/pollen";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import {
    getActiveOrganizationId,
    setActiveOrganizationId,
    useActiveOrganizationId,
} from "../lib/active-organization.ts";

export const Route = createFileRoute("/_dashboard")({
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.error) throw new Error("Authentication failed.");
        return { user: result.data?.user ?? null };
    },
    loader: async ({ context }) => {
        if (!context.user) {
            return {
                user: null,
                githubUsername: "",
                apiKeys: [] as ApiKey[],
                tierBalance: 0,
                packBalance: 0,
                communityEndpointsAllowed: false,
                billingState: null,
                paidWeek: 0,
                tierWeek: 0,
                organizations: [] as OrganizationSummary[],
                pendingInvitations: [] as PendingInvitation[],
            };
        }

        const [
            apiKeysResult,
            d1BalanceResult,
            profileResult,
            billingState,
            earningsTodayResult,
            organizationsResult,
            pendingInvitationsResult,
        ] = await Promise.all([
            apiClient["api-keys"]
                .$get()
                .then((r) => (r.ok ? r.json() : { data: [] })),
            apiClient.customer.balance
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.account.profile
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.stripe.billing
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.customer.balance.today
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.organizations
                .$get()
                .then((r) => (r.ok ? r.json() : { data: [] })),
            apiClient.organizations.invitations
                .$get()
                .then((r) => (r.ok ? r.json() : { data: [] })),
        ]);
        const sessionUser = context.user as typeof context.user & {
            githubUsername?: string | null;
        };
        const organizations = organizationsResult.data as OrganizationSummary[];

        const activeOrganizationId = getActiveOrganizationId();
        if (
            activeOrganizationId &&
            !organizations.some((org) => org.id === activeOrganizationId)
        ) {
            // The active org was deleted, or this member's access was
            // revoked, since it was last selected — fall back to the
            // personal account rather than showing a stale/empty org view.
            setActiveOrganizationId(null);
        }

        return {
            user: context.user,
            githubUsername:
                profileResult?.githubUsername ??
                sessionUser.githubUsername ??
                "",
            apiKeys: (apiKeysResult.data || []) as ApiKey[],
            tierBalance: d1BalanceResult?.tierBalance ?? 0,
            packBalance: d1BalanceResult?.packBalance ?? 0,
            communityEndpointsAllowed:
                profileResult?.communityEndpointsAllowed ?? false,
            billingState,
            paidWeek: earningsTodayResult?.paidWeek ?? 0,
            tierWeek: earningsTodayResult?.tierWeek ?? 0,
            organizations,
            pendingInvitations:
                pendingInvitationsResult.data as PendingInvitation[],
        };
    },
    component: DashboardLayout,
});

function DashboardLayout() {
    const data = Route.useLoaderData();
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);
    const activeOrganizationId = useActiveOrganizationId();

    async function handleSignOut(): Promise<void> {
        if (isSigningOut) return;
        setIsSigningOut(true);
        try {
            await authClient.signOut();
            window.location.href = "/news";
        } catch (error) {
            console.error("Sign out failed:", error);
            setIsSigningOut(false);
        }
    }

    async function handleSelectOrganization(
        organizationId: string | null,
    ): Promise<void> {
        setActiveOrganizationId(organizationId);
        await router.invalidate();
    }

    async function handleCreateOrganization(
        name: string,
    ): Promise<OrganizationSummary> {
        const response = await apiClient.organizations.$post({
            json: { name },
        });
        if (!response.ok) {
            const err = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;
            throw new Error(err?.message || "Failed to create organization");
        }
        // No invalidate here: the switcher immediately follows this call with
        // `onSelectOrganization(organization.id)`, which invalidates once
        // that also picks up the newly created org in the refreshed list.
        return (await response.json()) as OrganizationSummary;
    }

    async function handleAcceptInvitation(invitationId: string): Promise<void> {
        await apiClient.organizations.invitations[":memberId"].accept.$post({
            param: { memberId: invitationId },
        });
        await router.invalidate();
    }

    async function handleDeclineInvitation(
        invitationId: string,
    ): Promise<void> {
        await apiClient.organizations.invitations[":memberId"].decline.$post({
            param: { memberId: invitationId },
        });
        await router.invalidate();
    }

    return (
        <DashboardShell
            navItems={
                !data.user
                    ? SIGNED_OUT_NAV_ITEMS
                    : activeOrganizationId
                      ? undefined
                      : PERSONAL_NAV_ITEMS
            }
            accountArea={
                data.user ? (
                    <AccountSwitcher
                        username={data.githubUsername}
                        avatarUrl={data.user.image || ""}
                        onSignOut={handleSignOut}
                        organizations={data.organizations}
                        activeOrganizationId={activeOrganizationId}
                        onSelectOrganization={handleSelectOrganization}
                        onCreateOrganization={handleCreateOrganization}
                        className="w-full justify-start"
                    />
                ) : (
                    <SignedOutAccountArea />
                )
            }
            walletArea={
                data.user ? (
                    <SidebarWallet
                        tierBalance={data.tierBalance}
                        packBalance={data.packBalance}
                        // Personal-only figure (see the Pollen page comment
                        // for why) — don't show it under an org's balance.
                        paidWeek={activeOrganizationId ? 0 : data.paidWeek}
                        tierWeek={activeOrganizationId ? 0 : data.tierWeek}
                    />
                ) : undefined
            }
        >
            {data.user && !activeOrganizationId && (
                <PendingInvitationsList
                    invitations={data.pendingInvitations}
                    onAccept={handleAcceptInvitation}
                    onDecline={handleDeclineInvitation}
                />
            )}
            <Outlet />
        </DashboardShell>
    );
}

export function SignedOutAccountArea() {
    const { isSigningIn, error, signIn } = useGitHubSignIn();

    return (
        <div className="flex flex-col gap-2">
            <Button
                as="button"
                data-theme="accent"
                onClick={() => void signIn()}
                disabled={isSigningIn}
                className="w-full justify-center gap-2 text-center"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                {isSigningIn ? "Signing in..." : "Sign in with GitHub"}
            </Button>
            {error && (
                <p className="px-2 text-xs text-intent-danger-text">{error}</p>
            )}
        </div>
    );
}
