import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { isOutageStatus } from "../lib/outage.ts";

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const result = await authClient.getSession().catch(() => null);
        // During an outage, Pollen shows it in place of the balance.
        if (!result || (result.error && isOutageStatus(result.error.status))) {
            throw redirect({ to: "/pollen" });
        }
        if (result.error) throw new Error("Authentication failed.");
        throw redirect({ to: result.data?.user ? "/pollen" : "/news" });
    },
});
