import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: ({ context }) => {
        // redirect if already signed in
        if (context.user) throw redirect({ to: "/" });
    },
});

function RouteComponent() {
    const { auth } = Route.useRouteContext();
    const [loading, setLoading] = useState(false);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await auth.signIn.social({
            provider: "github",
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    return (
        <button type="button" onClick={handleSignIn} disabled={loading}>
            {loading ? "Sign-in in progress..." : "Sign-in with Github"}
        </button>
    );
}
