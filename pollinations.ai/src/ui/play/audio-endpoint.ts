import { audioEndpoints } from "../../data/playground-model-overrides";

// The inventory lists specialist routes before the generic speech endpoints.
const endpoints = Object.keys(
    audioEndpoints,
) as (keyof typeof audioEndpoints)[];

export function audioEndpoint(model: {
    supportedEndpoints: readonly string[];
}) {
    return endpoints.find((endpoint) =>
        model.supportedEndpoints.includes(endpoint),
    );
}
