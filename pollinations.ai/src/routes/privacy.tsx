import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../components/LegalPage.tsx";
import { PRIVACY_PAGE } from "../copy/content/legal.ts";

export const Route = createFileRoute("/privacy")({
    loader: () => fetch("/legal/PRIVACY_POLICY.md").then((r) => r.text()),
    head: () => ({
        meta: [
            { title: "Privacy | pollinations.ai" },
            { name: "description", content: PRIVACY_PAGE.pageDescription },
        ],
    }),
    component: () => <LegalPage markdown={Route.useLoaderData()} />,
});
