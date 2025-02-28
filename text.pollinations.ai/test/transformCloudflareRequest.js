/**
 * Custom request transformer for Cloudflare
 * Removes the seed parameter which is not supported by Cloudflare
 */
export function transformCloudflareRequest(requestBody) {
    // Create a new object without the seed property
    const { seed, ...restOfBody } = requestBody;
    return restOfBody;
}
