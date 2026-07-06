import { execFileSync } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const TB_HOST = "https://api.europe-west2.gcp.tinybird.co";
const SECRETS_PATH = fileURLToPath(
    new URL("../secrets/web.json", import.meta.url),
);
const SESSION_COOKIE = "treasury_session";
const READ_PIPES = new Set([
    "transactions_api",
    "meter_monthly_api",
    "usage_monthly_api",
    "ingest_runs_api",
    "revenue_monthly_api",
    "overrides_api",
]);
const WRITE_DATASOURCES = new Set(["meter_monthly", "overrides"]);
const INVOICE_ROOT = resolve(homedir(), "Documents/treasury-invoices");

type TreasurySecrets = {
    TREASURY_PASSWORD: string;
    TINYBIRD_TREASURY_READ_TOKEN: string;
    TINYBIRD_TREASURY_APPEND_TOKEN?: string;
};

let secretsCache: TreasurySecrets | null = null;

function readSecrets(): TreasurySecrets {
    if (secretsCache) return secretsCache;

    const out = execFileSync("sops", ["-d", SECRETS_PATH], {
        stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    const secrets = JSON.parse(out) as Partial<TreasurySecrets>;

    if (!secrets.TREASURY_PASSWORD || !secrets.TINYBIRD_TREASURY_READ_TOKEN) {
        throw new Error(
            "Treasury secrets missing password or Tinybird read token",
        );
    }

    secretsCache = {
        TREASURY_PASSWORD: secrets.TREASURY_PASSWORD,
        TINYBIRD_TREASURY_READ_TOKEN: secrets.TINYBIRD_TREASURY_READ_TOKEN,
        TINYBIRD_TREASURY_APPEND_TOKEN: secrets.TINYBIRD_TREASURY_APPEND_TOKEN,
    };
    return secretsCache;
}

function json(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
}

function parseCookies(req: IncomingMessage) {
    const header = req.headers.cookie ?? "";
    return new Map(
        header
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const [key, ...rest] = part.split("=");
                return [key, decodeURIComponent(rest.join("="))] as const;
            }),
    );
}

function signSession(password: string) {
    const payload = "treasury";
    const signature = createHmac("sha256", password)
        .update(payload)
        .digest("base64url");
    return `${payload}.${signature}`;
}

function safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthenticated(req: IncomingMessage, secrets: TreasurySecrets) {
    return safeEqual(
        parseCookies(req).get(SESSION_COOKIE) ?? "",
        signSession(secrets.TREASURY_PASSWORD),
    );
}

async function readBody(req: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
}

function findInvoiceFile(requested: string): string | null {
    if (!requested) return null;

    const direct = requested.startsWith(sep)
        ? resolve(requested)
        : resolve(INVOICE_ROOT, requested);
    const rootPrefix = INVOICE_ROOT.endsWith(sep)
        ? INVOICE_ROOT
        : `${INVOICE_ROOT}${sep}`;

    if (direct !== INVOICE_ROOT && !direct.startsWith(rootPrefix)) {
        return null;
    }
    if (!direct.toLowerCase().endsWith(".pdf")) return null;

    return existsSync(direct) ? direct : null;
}

async function handleApi(req: IncomingMessage, res: ServerResponse) {
    if (!req.url?.startsWith("/api/")) return false;

    let secrets: TreasurySecrets;
    try {
        secrets = readSecrets();
    } catch {
        json(res, 500, { error: "Treasury secrets unavailable" });
        return true;
    }

    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname === "/api/auth/session") {
        json(res, 200, { authenticated: isAuthenticated(req, secrets) });
        return true;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        res.statusCode = 204;
        res.setHeader(
            "Set-Cookie",
            `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        );
        res.end();
        return true;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
        const raw = await readBody(req);
        let body: { password?: string };
        try {
            body = JSON.parse(raw) as { password?: string };
        } catch {
            json(res, 400, { error: "Invalid JSON body" });
            return true;
        }
        if (!safeEqual(body.password ?? "", secrets.TREASURY_PASSWORD)) {
            json(res, 401, { error: "Unauthorized" });
            return true;
        }

        res.statusCode = 204;
        res.setHeader(
            "Set-Cookie",
            `${SESSION_COOKIE}=${encodeURIComponent(
                signSession(secrets.TREASURY_PASSWORD),
            )}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
        );
        res.end();
        return true;
    }

    if (!isAuthenticated(req, secrets)) {
        json(res, 401, { error: "Unauthorized" });
        return true;
    }

    if (url.pathname === "/api/files/invoice" && req.method === "GET") {
        const path = findInvoiceFile(url.searchParams.get("path") ?? "");
        if (!path || !statSync(path).isFile()) {
            json(res, 404, { error: "Invoice file not found" });
            return true;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${basename(path).replaceAll('"', "")}"`,
        );
        res.end(readFileSync(path));
        return true;
    }

    if (url.pathname.startsWith("/api/pipes/") && req.method === "GET") {
        const pipe = decodeURIComponent(
            url.pathname.slice("/api/pipes/".length),
        );
        if (!READ_PIPES.has(pipe)) {
            json(res, 404, { error: "Unknown pipe" });
            return true;
        }

        const upstream = await fetch(`${TB_HOST}/v0/pipes/${pipe}.json`, {
            headers: {
                Authorization: `Bearer ${secrets.TINYBIRD_TREASURY_READ_TOKEN}`,
            },
        });
        res.statusCode = upstream.status;
        res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") ?? "application/json",
        );
        res.end(await upstream.text());
        return true;
    }

    if (url.pathname === "/api/events" && req.method === "POST") {
        const datasource = url.searchParams.get("name") ?? "";
        if (!WRITE_DATASOURCES.has(datasource)) {
            json(res, 404, { error: "Unknown datasource" });
            return true;
        }

        if (!secrets.TINYBIRD_TREASURY_APPEND_TOKEN) {
            json(res, 503, {
                error: "Tinybird append token is not configured",
            });
            return true;
        }

        const upstream = await fetch(
            `${TB_HOST}/v0/events?name=${encodeURIComponent(datasource)}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${secrets.TINYBIRD_TREASURY_APPEND_TOKEN}`,
                    "Content-Type": "application/x-ndjson",
                },
                body: await readBody(req),
            },
        );
        res.statusCode = upstream.status;
        res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") ?? "application/json",
        );
        res.end(await upstream.text());
        return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
}

function treasuryApiPlugin(): Plugin {
    return {
        name: "treasury-api",
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (await handleApi(req, res)) return;
                next();
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (await handleApi(req, res)) return;
                next();
            });
        },
    };
}

export default defineConfig({
    plugins: [treasuryApiPlugin(), react(), tailwindcss()],
    server: { host: "127.0.0.1", port: 4180, strictPort: true },
    resolve: {
        dedupe: ["react", "react-dom"],
    },
});
