import debug from "debug";

const log = debug("pollinations:runpod");

// Env vars:
//   RUNPOD_API_KEY          - RunPod API key
//   RUNPOD_FLUX_ENDPOINT_ID - Endpoint ID for Flux worker
//   RUNPOD_ZIMAGE_ENDPOINT_ID - Endpoint ID for Z-Image worker

type RunPodEndpointType = "flux" | "zimage";

function getEndpointId(type: RunPodEndpointType): string {
    const envKey =
        type === "flux"
            ? "RUNPOD_FLUX_ENDPOINT_ID"
            : "RUNPOD_ZIMAGE_ENDPOINT_ID";
    const id = process.env[envKey];
    if (!id) {
        throw new Error(`${envKey} not set`);
    }
    return id;
}

function getApiKey(): string {
    const key = process.env.RUNPOD_API_KEY;
    if (!key) {
        throw new Error("RUNPOD_API_KEY not set");
    }
    return key;
}

/**
 * Calls a RunPod serverless endpoint via /runsync.
 * Accepts the same RequestInit as fetchFromLeastBusyServer (body is JSON string
 * with prompts, width, height, seed, steps, etc.).
 * Returns a Response with the same JSON body format as the Vast.ai /generate endpoint.
 */
export async function fetchFromRunPod(
    type: RunPodEndpointType,
    options: RequestInit,
): Promise<Response> {
    const endpointId = getEndpointId(type);
    const apiKey = getApiKey();
    const url = `https://api.runpod.ai/v2/${endpointId}/runsync`;

    // Parse the body to wrap it in RunPod's { input: ... } envelope
    const body = JSON.parse(options.body as string);

    log("Calling RunPod %s endpoint %s", type, endpointId);

    const startTime = Date.now();

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: body }),
    });

    const elapsed = Date.now() - startTime;
    log(
        "RunPod %s responded in %dms (status %d)",
        type,
        elapsed,
        response.status,
    );

    if (!response.ok) {
        const errorText = await response.text();
        log("RunPod error: %s", errorText.substring(0, 500));
        return new Response(errorText, {
            status: response.status,
            statusText: response.statusText,
        });
    }

    // RunPod wraps output: { id, status, output: <handler return value> }
    const result = await response.json();

    if (result.status === "FAILED") {
        log("RunPod job failed: %s", JSON.stringify(result));
        return new Response(
            JSON.stringify({ error: result.error || "RunPod job failed" }),
            {
                status: 500,
            },
        );
    }

    // result.output is the array returned by handler.py -- same format as /generate
    return new Response(JSON.stringify(result.output), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

export const fetchFromRunPodFlux = (options: RequestInit) =>
    fetchFromRunPod("flux", options);

export const fetchFromRunPodZImage = (options: RequestInit) =>
    fetchFromRunPod("zimage", options);
