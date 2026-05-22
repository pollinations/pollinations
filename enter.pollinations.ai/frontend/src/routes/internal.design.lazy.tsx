import { createLazyFileRoute } from "@tanstack/react-router";
import { DesignShowcase } from "../components/internal/design-showcase.tsx";

export const Route = createLazyFileRoute("/internal/design")({
    component: DesignShowcase,
});
