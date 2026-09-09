import type { GenerationModelEntry } from "../model-registry.ts";

/** Text-input media with a reachable native generation route. */
export function mediaPromptRoute(
    entry: Pick<GenerationModelEntry, "definition" | "supportedEndpoints">,
): string | undefined {
    if (!entry.definition.inputModalities?.includes("text")) return;
    switch (entry.definition.category) {
        case "image":
        case "video":
            if (entry.supportedEndpoints.includes("/image/{prompt}"))
                return "/image/";
            return;
        case "audio":
            if (entry.supportedEndpoints.includes("/audio/{text}"))
                return "/audio/";
            return;
        case "3d":
            return "/3d/";
    }
}
