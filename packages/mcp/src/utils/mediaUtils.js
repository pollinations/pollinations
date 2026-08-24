import { requireApiKey } from "./authUtils.js";
import { arrayBufferToBase64, fetchResponseWithAuth } from "./coreUtils.js";

export async function fetchGeneratedMedia(
    url,
    { expectedType, output = "url", timeoutMs = 300000 },
    context,
) {
    requireApiKey(context);
    const response = await fetchResponseWithAuth(url, { timeoutMs }, context);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith(`${expectedType}/`)) {
        await response.body?.cancel();
        throw new Error(
            `Expected ${expectedType} response, received ${contentType || "no content type"}`,
        );
    }
    if (output === "url") {
        await response.body?.cancel();
        return { url, contentType };
    }
    return {
        url,
        contentType,
        data: arrayBufferToBase64(await response.arrayBuffer()),
    };
}
