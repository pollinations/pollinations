import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../components/LegalPage.tsx";
import { REFUNDS_PAGE } from "../copy/content/legal.ts";

export const Route = createFileRoute("/refunds")({
    loader: () =>
        fetch("/legal/REFUNDS_AND_CANCELLATIONS.md").then((r) => r.text()),
    head: () => ({
        meta: [
            { title: "Refunds | pollinations.ai" },
            { name: "description", content: REFUNDS_PAGE.pageDescription },
        ],
    }),
    component: () => <LegalPage markdown={Route.useLoaderData()} />,
});
