import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

export type BedrockCredentials = {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
};

export function bedrockCredentials(
    config: Record<string, unknown>,
): BedrockCredentials | undefined {
    const accessKeyId = config["aws-access-key-id"];
    const secretAccessKey = config["aws-secret-access-key"];
    const region = config["aws-region"];
    return config.provider === "bedrock" &&
        typeof accessKeyId === "string" &&
        accessKeyId &&
        typeof secretAccessKey === "string" &&
        secretAccessKey &&
        typeof region === "string" &&
        region
        ? { accessKeyId, secretAccessKey, region }
        : undefined;
}

export async function signBedrockHeaders(
    url: URL,
    body: string,
    headers: Record<string, string>,
    credentials: BedrockCredentials,
): Promise<Record<string, string>> {
    const signer = new SignatureV4({
        credentials,
        region: credentials.region,
        service: "bedrock",
        sha256: Sha256,
    });
    const signed = await signer.sign({
        method: "POST",
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.pathname,
        headers: { ...headers, host: url.host },
        body,
    });
    return signed.headers;
}
