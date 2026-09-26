import { AuthModalLoading } from "@pollinations/ui/auth";
import { useRouterState } from "@tanstack/react-router";

const authTitles: Record<string, string> = {
    "/sign-in": "Sign in",
    "/app/sign-in": "Sign in",
    "/authorize": "Connect",
    "/device": "Allow your device",
    "/edit-key": "Edit key",
    "/top-up": "Top-up",
};

export function DashboardPending() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });
    const title = authTitles[pathname];
    return title ? <AuthModalLoading title={title} /> : null;
}
