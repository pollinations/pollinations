import { DesignShowcase } from "@pollinations_ai/ui/showcase";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/internal/design")({
    component: DesignShowcase,
});
