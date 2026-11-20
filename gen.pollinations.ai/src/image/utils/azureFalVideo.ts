import { UpstreamError } from "@shared/error.ts";
import { getImageEnv } from "../env.ts";
import { sleep } from "../util.ts";
import { fetchUpstream } from "./fetchUpstream.ts";

const origin = "https://myceli-prod-img-2-eastus2.services.ai.azure.com";

export function fetchFalVideo(url: string, errorLabel: string) {
    return fetchUpstream(
        url,
        new URL(url).origin === origin
            ? {
                  headers: {
                      "api-key":
                          getImageEnv(
                              "AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY",
                          ) ?? "",
                  },
                  redirect: "manual",
                  errorLabel,
              }
            : { errorLabel },
    );
}

export async function runAzureFalVideo(
    deployment: string,
    queue: string,
    operation: string,
    input: Record<string, unknown>,
): Promise<Response> {
    const base = `${origin}/providers/falai/v1/${queue}`;
    const key = getImageEnv("AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "Azure fal video is not configured",
        });
    const headers = { "api-key": key, "Content-Type": "application/json" };
    const submission = await fetchUpstream(`${base}/${operation}`, {
        method: "POST",
        headers,
        redirect: "manual",
        body: JSON.stringify({ ...input, model: deployment }),
        errorLabel: "Azure fal video submission failed",
    });
    const { request_id: id } = (await submission.json()) as {
        request_id?: string;
    };
    if (!id)
        throw UpstreamError.fromProvider(502, {
            message: "Azure fal video returned no request ID",
        });
    const resultUrl = `${base}/requests/${encodeURIComponent(id)}`;
    while (true) {
        const poll = await fetchUpstream(`${resultUrl}/status`, {
            headers,
            redirect: "manual",
            errorLabel: "Azure fal video status check failed",
        });
        const { status } = (await poll.json()) as { status?: string };
        if (status === "COMPLETED") break;
        if (status !== "IN_PROGRESS" && status !== "IN_QUEUE") {
            throw UpstreamError.fromProvider(502, {
                message: "Azure fal video did not complete",
            });
        }
        await sleep(3000);
    }
    const result = await fetchUpstream(resultUrl, {
        headers,
        redirect: "manual",
        errorLabel: "Azure fal video result fetch failed",
    });
    return result;
}
