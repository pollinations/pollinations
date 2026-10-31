import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { DASHBOARD_AUTH_FAILED_MESSAGE } from "../components/layout/dashboard-session-failure.ts";
import { isOutageStatus } from "../lib/outage.ts";

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const result = await authClient.getSession().catch(() => null);
        // During an outage, /balance shows it in place of the balance.
        if (!result || (result.error && isOutageStatus(result.error.status))) {
            throw redirect({ to: "/balance" });
        }
        if (result.error) throw new Error(DASHBOARD_AUTH_FAILED_MESSAGE);
        throw redirect({ to: result.data?.user ? "/balance" : "/news" });
    },
});
