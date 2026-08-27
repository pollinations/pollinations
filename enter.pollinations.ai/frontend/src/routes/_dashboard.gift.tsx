import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dashboard/gift")({
    validateSearch: (
        search: Record<string, unknown>,
    ): { success: boolean; canceled: boolean } => ({
        success: search.success === true || search.success === "true",
        canceled: search.canceled === true || search.canceled === "true",
    }),
    beforeLoad: ({ search }) => {
        throw redirect({
            to: "/pollen",
            search: {
                mode: "gift",
                success: search.success || undefined,
                canceled: search.canceled || undefined,
            },
        });
    },
});
