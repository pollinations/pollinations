import { Heading, Text } from "@pollinations/ui";
import { AuthModal, AuthModalHeader } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { SignedOutAccountArea } from "./_dashboard.tsx";

export const Route = createFileRoute("/app/sign-in")({
    validateSearch: (search: Record<string, unknown>) => ({
        client_id: typeof search.client_id === "string" ? search.client_id : "",
    }),
    head: () => ({ meta: [{ title: "Sign in | pollinations.ai" }] }),
    component: AppSignIn,
});

function AppSignIn() {
    const { client_id } = Route.useSearch();
    const name =
        {
            pk_Bxny9FSNDpousKqW: "KPI",
            pk_LBL0KnkHI6AZopCc: "Economics",
            pk_vVa38CFt1R1gGScW: "Observability",
        }[client_id] || "Pollinations";
    return (
        <AuthModal dialog={{ labelledBy: "app-title" }}>
            <AuthModalHeader />
            <div className="flex flex-col gap-5 px-6 pb-6 pt-4">
                <div className="flex flex-col gap-2">
                    <Heading id="app-title">{name}</Heading>
                    <Text tone="soft">
                        Sign in with your Pollinations admin account.
                    </Text>
                </div>
                <SignedOutAccountArea />
            </div>
        </AuthModal>
    );
}
