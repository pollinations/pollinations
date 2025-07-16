export async function handler(event, context) {
    // Collect all query parameters
    const { queryStringParameters } = event;

    // Gather information about the request
    const requestInfo = {
        timestamp: new Date().toISOString(),
        queryParams: queryStringParameters || {},
        headers: event.headers || {},
        ip: event.requestContext?.identity?.sourceIp || "unknown",
        userAgent:
            event.headers?.["user-agent"] ||
            event.headers?.["User-Agent"] ||
            "unknown",
        referer: event.headers?.referer || event.headers?.Referer || "unknown",
        path: event.path,
        httpMethod: event.httpMethod,
        requestId:
            event.requestContext?.requestId ||
            context.awsRequestId ||
            "unknown",
        // Add any other relevant information from the request object
    };

    // Log the tracking information
    console.log("Tracking request:", JSON.stringify(requestInfo, null, 2));

    // Return a 1x1 transparent pixel GIF
    // This is a minimal valid GIF format for a 1x1 transparent pixel
    const transparentPixelGif = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
    );

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control":
                "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        },
        body: transparentPixelGif.toString("base64"),
        isBase64Encoded: true,
    };
}
