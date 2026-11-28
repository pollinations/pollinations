import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function getGenerationJob(params, context) {
    requireApiKey(context);

    const job = await fetchJsonWithAuth(
        buildUrl(`/v1/jobs/${encodeURIComponent(params.id)}`),
        {},
        context,
    );

    const content = [createTextContent(job, true)];
    if (job.status === "succeeded" && job.result_url) {
        content.unshift({
            type: "resource_link",
            uri: job.result_url,
            name: "Generated media",
        });
    }
    return createMCPResponse(content);
}

export const jobTools = [
    [
        "getGenerationJob",
        "Check a media generation that was started with async=true on generateImage, generateVideo, generateAudio or generate3D. Pass the job id from that response. Returns status pending, succeeded or failed; poll again after the Retry-After delay while pending. When succeeded, the result is returned as a resource link (result_url needs the same API key).",
        {
            id: z
                .string()
                .regex(
                    /^[0-9a-f]{64}$/,
                    "Job id must be the 64-character hex id returned by an async generation",
                )
                .describe("Async media job id"),
        },
        getGenerationJob,
    ],
];
