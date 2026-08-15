import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
    CommunityEndpoints,
    publicCommunityFallbackOptions,
} from "../components/community-endpoints";
import type { FallbackModelOption } from "../components/community-endpoints/types.ts";
import {
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "../components/models/model-catalog.ts";
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
    const { communityEndpointsAllowed } = DashboardRoute.useLoaderData();
    const [fallbackOptions, setFallbackOptions] = useState<
        FallbackModelOption[]
    >([]);

    const loadFallbackOptions = useCallback(async (refresh = false) => {
        try {
            const models = await fetchModelCatalog({ refresh });
            setFallbackOptions(
                publicCommunityFallbackOptions(
                    getModelPricesFromCatalog(models),
                ),
            );
        } catch (error) {
            console.error("Fallback model catalog fetch failed:", error);
        }
    }, []);

    useEffect(() => {
        void loadFallbackOptions();
    }, [loadFallbackOptions]);

    return (
        <div className="flex flex-col gap-6">
            <CommunityEndpoints
                canPublish={communityEndpointsAllowed}
                fallbackOptions={fallbackOptions}
                onChange={() => loadFallbackOptions(true)}
            />
        </div>
    );
}
