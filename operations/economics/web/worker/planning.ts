import { HTTPException } from "hono/http-exception";
import type { Env } from "./env";

// Fixed private file: callers cannot choose another Drive file or an arbitrary URL.
export async function readPlanningDocument(
    env: Env["Bindings"],
): Promise<unknown> {
    const fileId = env.ECONOMICS_PLANNING_FILE_ID;
    if (
        !env.ECONOMICS_GOOGLE_DRIVE_CREDENTIALS ||
        !fileId ||
        !/^[\w-]+$/.test(fileId)
    )
        throw new HTTPException(503, {
            message: "Private planning document connection is not configured",
        });
    let credentials: {
        client_email: string;
        private_key: string;
    };
    try {
        credentials = JSON.parse(env.ECONOMICS_GOOGLE_DRIVE_CREDENTIALS);
        if (
            ![credentials.client_email, credentials.private_key].every(
                (value) => typeof value === "string" && value,
            )
        )
            throw new Error();
    } catch {
        throw new HTTPException(503, {
            message: "Private planning document credential is invalid",
        });
    }
    const encode = (value: string) =>
        btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${encode(
        JSON.stringify({
            iss: credentials.client_email,
            scope: "https://www.googleapis.com/auth/drive.readonly",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
        }),
    )}`;
    const key = await crypto.subtle.importKey(
        "pkcs8",
        Uint8Array.from(
            atob(credentials.private_key.replace(/-----[^-]+-----|\s/g, "")),
            (c) => c.charCodeAt(0),
        ),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );
    const assertion = `${signingInput}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok)
        throw new HTTPException(502, {
            message: "Private planning document authentication failed",
        });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token)
        throw new HTTPException(502, {
            message: "Private planning document authentication failed",
        });
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            headers: { Authorization: `Bearer ${token.access_token}` },
            signal: AbortSignal.timeout(15_000),
        },
    );
    if (!response.ok)
        throw new HTTPException(502, {
            message: "Private planning document could not be read",
        });
    try {
        return await response.json();
    } catch {
        throw new HTTPException(502, {
            message: "Private planning document is not valid JSON",
        });
    }
}
