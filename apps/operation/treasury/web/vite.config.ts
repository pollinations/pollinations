import { execFileSync } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
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
const FORAGER_CONFIG_PATH = fileURLToPath(
    new URL("../../forager/config.json", import.meta.url),
);
const SESSION_COOKIE = "treasury_session";
const READ_PIPES = new Set([
    "invoices_ep",
    "payments_ep",
    "meter_monthly_ep",
    "usage_ep",
    "runs_ep",
    "revenue_ep",
    "payments_monthly_ep",
]);
const WRITE_DATASOURCES = new Set(["overrides", "invoices", "meter_monthly"]);

type TreasurySecrets = {
    TREASURY_PASSWORD: string;
    TINYBIRD_TREASURY_READ_TOKEN: string;
    TINYBIRD_TREASURY_APPEND_TOKEN?: string;
};

let secretsCache: TreasurySecrets | null = null;
let archiveDirCache: string | null = null;

function expandHome(path: string) {
    return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function readArchiveDir() {
    if (archiveDirCache) return archiveDirCache;

    const config = JSON.parse(readFileSync(FORAGER_CONFIG_PATH, "utf8")) as {
        archive_dir?: string;
    };
    if (!config.archive_dir) {
        throw new Error("Forager config missing archive_dir");
    }
    archiveDirCache = resolve(expandHome(config.archive_dir));
    return archiveDirCache;
}

function invoicePathFromRef(fileRef: string) {
    if (!fileRef) return null;
    const archiveDir = readArchiveDir();
    const candidate = resolve(
        fileRef.startsWith("/") ? fileRef : resolve(archiveDir, fileRef),
    );
    const archivePrefix = archiveDir.endsWith(sep)
        ? archiveDir
        : `${archiveDir}${sep}`;
    if (candidate !== archiveDir && !candidate.startsWith(archivePrefix)) {
        return null;
    }
    if (!candidate.toLowerCase().endsWith(".pdf")) return null;
    return candidate;
}

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
        const body = JSON.parse(raw || "{}") as { password?: string };
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
        try {
            const filePath = invoicePathFromRef(
                url.searchParams.get("path") ?? "",
            );
            if (!filePath) {
                json(res, 400, { error: "Invalid invoice file" });
                return true;
            }
            if (!existsSync(filePath) || !statSync(filePath).isFile()) {
                json(res, 404, { error: "Invoice file not found" });
                return true;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `inline; filename="${basename(filePath).replaceAll('"', "")}"`,
            );
            createReadStream(filePath).pipe(res);
            return true;
        } catch {
            json(res, 500, { error: "Invoice file unavailable" });
            return true;
        }
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
