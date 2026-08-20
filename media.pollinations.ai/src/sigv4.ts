import { AwsClient } from "aws4fetch";

export interface KeyDetails {
    id: string;
    key: string; // SHA-256 hash (base64url)
    userId: string;
    name: string | null;
    type: "secret" | "publishable";
    byopClientKeyId: string | null;
}

const KEY_BY_ID_URL = "https://gen.pollinations.ai/account/key-by-id/";

export async function lookupKeyById(accessKeyId: string): Promise<KeyDetails | null> {
    try {
        const res = await fetch(`${KEY_BY_ID_URL}${encodeURIComponent(accessKeyId)}`);
        if (!res.ok) return null;
        const data = await res.json<KeyDetails & { valid: boolean }>();
        if (!data || !data.valid) return null;
        return data;
    } catch {
        return null;
    }
}

export async function verifySigV4(
    req: Request,
    keyDetails: KeyDetails,
    options?: {
        region?: string;
        service?: string;
    }
): Promise<boolean> {
    const url = new URL(req.url);
    const region = options?.region || "auto";
    const service = options?.service || "s3";

    // aws4fetch AwsClient
    const aws = new AwsClient({
        accessKeyId: keyDetails.id,
        secretAccessKey: keyDetails.key,
        region,
        service,
    });

    // Workaround for Cloudflare Workers Accept-Encoding header modification
    const headers = new Headers(req.headers);
    const cfClientAcceptEncoding = (req as unknown as { cf?: { clientAcceptEncoding?: string } }).cf?.clientAcceptEncoding;
    if (cfClientAcceptEncoding) {
        headers.set("accept-encoding", cfClientAcceptEncoding);
    }

    // Extract authorization / query params
    const isPresigned = url.searchParams.has("X-Amz-Signature");

    try {
        const signInit: RequestInit & { aws?: Record<string, unknown> } = {
            method: req.method,
            headers,
            aws: {
                signQuery: isPresigned,
            },
        };

        if (isPresigned) {
            // For presigned URL signature verification, sign the request URL and params
            const datetime = url.searchParams.get("X-Amz-Date");
            if (datetime) {
                signInit.aws = {
                    ...signInit.aws,
                    datetime,
                };
            }
        }

        const signedReq = await aws.sign(url.toString(), signInit);

        if (isPresigned) {
            const signedUrl = new URL(signedReq.url);
            const expectedSig = signedUrl.searchParams.get("X-Amz-Signature");
            const actualSig = url.searchParams.get("X-Amz-Signature");
            return expectedSig === actualSig;
        } else {
            const expectedAuth = signedReq.headers.get("authorization");
            const actualAuth = req.headers.get("authorization");
            if (!expectedAuth || !actualAuth) return false;
            // Compare Signature parts
            const expectedSigMatch = expectedAuth.match(/Signature=([a-f0-9]+)/i);
            const actualSigMatch = actualAuth.match(/Signature=([a-f0-9]+)/i);
            if (!expectedSigMatch || !actualSigMatch) return false;
            return expectedSigMatch[1].toLowerCase() === actualSigMatch[1].toLowerCase();
        }
    } catch (e) {
        console.error("SigV4 verification failed:", e);
        return false;
    }
}
