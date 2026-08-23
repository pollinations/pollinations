import { z } from "zod";

export const R2_CREDENTIAL_TTL_SECONDS = 15 * 60;

export interface R2CredentialEnv {
    R2_ACCOUNT_ID: string;
    R2_BUCKET_NAME: string;
    R2_PARENT_ACCESS_KEY_ID: string;
    R2_TEMP_CREDENTIALS_API_TOKEN: string;
}

const CloudflareResponseSchema = z.object({
    success: z.literal(true),
    result: z.object({
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
        sessionToken: z.string().min(1),
    }),
});

export async function issueR2Credentials(
    env: R2CredentialEnv,
    input: {
        prefix: string;
        ttlSeconds: number;
    },
): Promise<z.infer<typeof CloudflareResponseSchema>["result"] | null> {
    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.R2_ACCOUNT_ID}/r2/temp-access-credentials`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.R2_TEMP_CREDENTIALS_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bucket: env.R2_BUCKET_NAME,
                    parentAccessKeyId: env.R2_PARENT_ACCESS_KEY_ID,
                    permission: "object-read-write",
                    ttlSeconds: input.ttlSeconds,
                    prefixes: [input.prefix],
                }),
            },
        );
        if (!response.ok) return null;

        const parsed = CloudflareResponseSchema.safeParse(
            await response.json(),
        );
        return parsed.success ? parsed.data.result : null;
    } catch {
        return null;
    }
}
