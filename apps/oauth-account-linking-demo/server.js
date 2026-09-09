import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const port = 8790;
const appUrl = `http://localhost:${port}`;
const enterUrl = process.env.ENTER_URL || "https://enter.pollinations.ai";
const genUrl = process.env.GEN_URL || "https://gen.pollinations.ai";
const clientId = process.env.CLIENT_ID || "";
const encryptionKey = Buffer.from(
    process.env.TOKEN_ENCRYPTION_KEY || "",
    "hex",
);

if (!clientId || encryptionKey.length !== 32) {
    throw new Error("Set CLIENT_ID and a 32-byte TOKEN_ENCRYPTION_KEY.");
}

const db = new DatabaseSync(new URL("./demo.db", import.meta.url).pathname);
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS oauth_logins (
        state TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        verifier TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_connections (
        user_id INTEGER PRIMARY KEY,
        provider_user_id TEXT NOT NULL,
        encrypted_access_token TEXT NOT NULL
    );
    INSERT OR IGNORE INTO users (id) VALUES (1);
`);

const saveLogin = db.prepare(`
    INSERT INTO oauth_logins (state, user_id, verifier, expires_at)
    VALUES (?, ?, ?, ?)
`);
const consumeLogin = db.prepare(`
    DELETE FROM oauth_logins WHERE state = ?
    RETURNING user_id, verifier, expires_at
`);
const saveConnection = db.prepare(`
    INSERT INTO provider_connections
        (user_id, provider_user_id, encrypted_access_token)
    VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
        provider_user_id = excluded.provider_user_id,
        encrypted_access_token = excluded.encrypted_access_token
`);
const getConnection = db.prepare(`
    SELECT encrypted_access_token FROM provider_connections WHERE user_id = ?
`);

// Replace this function with the host app's authenticated-session lookup.
function currentUser() {
    return db.prepare("SELECT id FROM users WHERE id = 1").get();
}

function encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
        "base64url",
    );
}

function decrypt(value) {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
    ]).toString();
}

function base64url(value) {
    return Buffer.from(value).toString("base64url");
}

function send(response, status, body, contentType = "text/html") {
    response.writeHead(status, {
        "Content-Type": `${contentType}; charset=utf-8`,
    });
    response.end(body);
}

function redirect(response, location) {
    response.writeHead(302, { Location: location });
    response.end();
}

function home(response) {
    const user = currentUser();
    const connected = getConnection.get(user.id);
    send(
        response,
        200,
        `<!doctype html><meta charset="utf-8"><title>OAuth account linking</title>
        <h1>OAuth account linking</h1>
        <p>${connected ? "Pollinations connected." : "Pollinations not connected."}</p>
        <p><a href="/connect">Connect Pollinations</a></p>
        <form method="post" action="/generate"><button ${connected ? "" : "disabled"}>Generate a greeting</button></form>`,
    );
}

function connect(response) {
    const user = currentUser();
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    saveLogin.run(state, user.id, verifier, Date.now() + 10 * 60 * 1000);

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: `${appUrl}/callback`,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
    });
    redirect(response, `${enterUrl}/authorize?${params}`);
}

async function callback(response, url) {
    const login = consumeLogin.get(url.searchParams.get("state"));
    if (!login || login.expires_at < Date.now()) {
        throw new Error("OAuth state is missing or expired.");
    }
    if (url.searchParams.get("error")) {
        throw new Error(`Authorization: ${url.searchParams.get("error")}`);
    }

    const tokenResponse = await fetch(`${enterUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: url.searchParams.get("code") || "",
            client_id: clientId,
            redirect_uri: `${appUrl}/callback`,
            code_verifier: login.verifier,
        }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) {
        throw new Error(
            token.error_description || token.error || "Token exchange failed.",
        );
    }

    const profileResponse = await fetch(`${enterUrl}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.sub) {
        throw new Error("Could not identify the Pollinations account.");
    }

    saveConnection.run(
        login.user_id,
        String(profile.sub),
        encrypt(token.access_token),
    );
    redirect(response, "/");
}

async function generate(response) {
    const connection = getConnection.get(currentUser().id);
    if (!connection) return send(response, 401, "Connect Pollinations first.");

    const generationResponse = await fetch(`${genUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${decrypt(connection.encrypted_access_token)}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Say hello in one sentence." }],
        }),
    });
    const generation = await generationResponse.json();
    send(
        response,
        generationResponse.status,
        generationResponse.ok
            ? generation.choices[0].message.content
            : JSON.stringify(generation, null, 2),
        "text/plain",
    );
}

createServer(async (request, response) => {
    const url = new URL(request.url, appUrl);
    try {
        if (request.method === "GET" && url.pathname === "/")
            return home(response);
        if (request.method === "GET" && url.pathname === "/connect")
            return connect(response);
        if (request.method === "GET" && url.pathname === "/callback")
            return await callback(response, url);
        if (request.method === "POST" && url.pathname === "/generate")
            return await generate(response);
        send(response, 404, "Not found.", "text/plain");
    } catch (error) {
        send(
            response,
            500,
            error instanceof Error ? error.message : String(error),
            "text/plain",
        );
    }
}).listen(port, () => console.log(`Account-linking demo: ${appUrl}`));
