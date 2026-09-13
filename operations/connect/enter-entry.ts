import { config } from "@frontend/config";

// Configure only the transport. The router, pages and API consumers are Enter's.
Object.assign(config, {
    genBaseUrl: `${location.origin}/gen`,
    communityCatalogUrl: null,
});
await import("@frontend/main");

// Resume Connect review actions after real route/callback navigation.
void import("./review-driver").then(({ runReviewSteps }) => runReviewSteps());
