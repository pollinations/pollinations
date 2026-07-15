import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.error) throw new Error("Authentication failed.");
        throw redirect({ to: result.data?.user ? "/pollen" : "/news" });
    },
});
