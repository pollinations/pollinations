import { signOut, useDashboardSession } from "@pollinations/auth/react";
import { Alert } from "@pollinations/ui";
import { DashboardAccountMenu } from "@pollinations/ui/auth";

export function FlowAccount({ authPath }: { authPath: string }) {
    const { user, error } = useDashboardSession(authPath);
    if (error) return <Alert>{error}</Alert>;
    if (!user) return null;
    return (
        <DashboardAccountMenu
            className="flow-reviewer-account"
            user={user}
            onSignOut={() => signOut(authPath)}
        />
    );
}
