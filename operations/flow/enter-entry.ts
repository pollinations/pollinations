import { config } from "@frontend/config";

// Configure only the transport. The router, pages and API consumers are Enter's.
Object.assign(config, { genBaseUrl: `${location.origin}/gen` });
await import("@frontend/main");

// Resume Flow review actions after real route/callback navigation.
void import("./review-driver").then(({ runReviewSteps }) => runReviewSteps());
