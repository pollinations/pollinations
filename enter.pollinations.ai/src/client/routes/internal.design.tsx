import { createFileRoute, redirect } from "@tanstack/react-router";
import { DesignShowcase } from "../components/internal/design-showcase.tsx";

export const Route = createFileRoute("/internal/design")({
    beforeLoad: () => {
        if (!import.meta.env.DEV) {
            throw redirect({ to: "/" });
        }
    },
    component: DesignShowcase,
});
