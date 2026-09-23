import { Section } from "@pollinations/ui";
import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { Deployments } from "../components/community-endpoints";
import {
    DashboardLoading,
    LoadError,
} from "../components/layout/dashboard-loading.tsx";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-models")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: MyModelsPage,
});

function MyModelsPage() {
    const { profile } = useDeferredValue(DashboardRoute.useLoaderData());
    return (
        <Await
            promise={profile}
            fallback={
                <DashboardLoading
                    title="My models"
                    label="Loading publisher details…"
                />
            }
        >
            {(details) =>
                details ? (
                    <Deployments
                        canPublish={details.communityEndpointsAllowed}
                    />
                ) : (
                    <Section title="My models">
                        <LoadError>Couldn’t load publisher details.</LoadError>
                    </Section>
                )
            }
        </Await>
    );
}
