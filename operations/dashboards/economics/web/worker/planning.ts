import { HTTPException } from "hono/http-exception";
import { VENDOR_JOURNALS_FOLDER_ID } from "../src/lib/driveSources";
import {
    assembleVendorJournals,
    type VendorJournal,
} from "../src/lib/vendorJournals";
import type { Env } from "./env";

// Fixed private folder: callers cannot choose another Drive source or URL.
type DriveEnv = Pick<Env["Bindings"], "ECONOMICS_GOOGLE_DRIVE_CREDENTIALS">;

async function driveToken(env: DriveEnv, signal: AbortSignal): Promise<string> {
    if (!env.ECONOMICS_GOOGLE_DRIVE_CREDENTIALS)
        throw new HTTPException(503, {
            message: "Vendor journal connection is not configured",
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
            message: "Vendor journal credential is invalid",
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
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!tokenResponse.ok)
        throw new HTTPException(502, {
            message: "Vendor journal authentication failed",
        });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token)
        throw new HTTPException(502, {
            message: "Vendor journal authentication failed",
        });
    return token.access_token;
}

// Private, per-worker memory only. Every HTTP request still passes admin auth.
let journalCache:
    | {
          credentials: string | undefined;
          expiresAt: number;
          value: ReturnType<typeof assembleVendorJournals>;
      }
    | undefined;
let journalLoad = 0;

export async function readVendorJournals(env: DriveEnv, refresh = false) {
    if (
        !refresh &&
        journalCache &&
        journalCache.credentials === env.ECONOMICS_GOOGLE_DRIVE_CREDENTIALS &&
        Date.now() < journalCache.expiresAt
    )
        return journalCache.value;
    // Cache data only: pending I/O belongs to its original Worker request.
    const load = ++journalLoad;
    const value = await loadVendorJournals(env, AbortSignal.timeout(60_000));
    // A slower, older load must not overwrite a newer refresh.
    if (load === journalLoad)
        journalCache = {
            credentials: env.ECONOMICS_GOOGLE_DRIVE_CREDENTIALS,
            expiresAt: Date.now() + 24 * 60 * 60_000,
            value,
        };
    return value;
}

async function loadVendorJournals(env: DriveEnv, signal: AbortSignal) {
    const token = await driveToken(env, signal);
    const headers = { Authorization: `Bearer ${token}` };
    const files: { id: string; name: string }[] = [];
    let pageToken = "";
    do {
        const query = new URLSearchParams({
            q: `'${VENDOR_JOURNALS_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/json'`,
            fields: "nextPageToken,incompleteSearch,files(id,name)",
            pageSize: "1000",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
            orderBy: "name",
        });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?${query}`,
            {
                headers,
                signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
            },
        );
        if (!response.ok)
            throw new HTTPException(502, {
                message: "Vendor journals could not be listed",
            });
        const page = (await response.json()) as {
            files: { id: string; name: string }[];
            nextPageToken?: string;
            incompleteSearch?: boolean;
        };
        if (!Array.isArray(page.files) || page.incompleteSearch)
            throw new HTTPException(502, {
                message: "Vendor journal listing is incomplete",
            });
        files.push(...page.files);
        pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    const journals: { id: string; name: string; content: VendorJournal }[] = [];
    // Bound parallel reads; one token and one complete snapshot per dashboard load.
    for (let offset = 0; offset < files.length; offset += 8) {
        journals.push(
            ...(await Promise.all(
                files.slice(offset, offset + 8).map(async (file) => {
                    const response = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
                        {
                            headers,
                            signal: AbortSignal.any([
                                signal,
                                AbortSignal.timeout(15_000),
                            ]),
                        },
                    );
                    if (!response.ok)
                        throw new HTTPException(502, {
                            message: `Vendor journal could not be read: ${file.name}`,
                        });
                    return {
                        ...file,
                        content: (await response.json()) as VendorJournal,
                    };
                }),
            )),
        );
    }
    return assembleVendorJournals(journals);
}
