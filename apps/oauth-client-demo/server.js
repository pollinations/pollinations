/**
 * "Sign in with Pollinations" demo client.
 *
 * A minimal OAuth 2.1 client (authorization-code + PKCE S256, public client)
 * against enter.pollinations.ai — the same integration shape a third-party
 * site like alp.anondrop.net uses. Zero dependencies, Node >= 18.
 *
 * Flow: RFC 8414 discovery → /authorize redirect with PKCE + state →
 * form-encoded code exchange at the token endpoint → userinfo → optional
 * delegated generation call with the issued key.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const ISSUER = process.env.ISSUER || "https://enter.pollinations.ai";
const CLIENT_ID = process.env.CLIENT_ID || "";
const PORT = Number(process.env.PORT) || 8789;
const REDIRECT_URI =
    process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const GEN_URL = process.env.GEN_URL || "https://gen.pollinations.ai";
const SCOPE = process.env.SCOPE ?? "profile";

/** state -> { verifier, createdAt } for logins awaiting the callback */
const pending = new Map();
/** sid cookie -> { accessToken, tokenResponse, profile } */
const sessions = new Map();

async function discover() {
    const res = await fetch(
        new URL("/.well-known/oauth-authorization-server", ISSUER),
    );
    if (!res.ok) throw new Error(`Discovery failed: HTTP ${res.status}`);
    return res.json();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function page(body) {
    return `<!doctype html><html><head><meta charset="utf-8">
<title>Sign in with Pollinations — demo client</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:640px;margin:3rem auto;padding:0 1rem;line-height:1.5}
  a.button,button{display:inline-block;background:#111;color:#fff;border:0;border-radius:8px;
    padding:.6rem 1.1rem;font-size:1rem;text-decoration:none;cursor:pointer}
  pre{background:#f4f4f4;padding:1rem;border-radius:8px;overflow-x:auto}
  .err{color:#b00020}
</style></head><body>
<h1>🌻 Demo client</h1>${body}</body></html>`;
}

function send(res, status, body, headers = {}) {
    res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        ...headers,
    });
    res.end(body);
}

function redirect(res, location, headers = {}) {
    res.writeHead(302, { Location: location, ...headers });
    res.end();
}

function getSession(req) {
    const cookie = req.headers.cookie || "";
    const sid = cookie.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
    return sid
        ? { sid, session: sessions.get(sid) }
        : { sid: null, session: null };
}

async function handleLogin(res) {
    const meta = await discover();
    // Drop abandoned logins so the map can't grow unbounded.
    for (const [state, login] of pending) {
        if (Date.now() - login.createdAt > 10 * 60 * 1000) {
            pending.delete(state);
        }
    }
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("base64url");
    pending.set(state, { verifier, createdAt: Date.now() });

    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    if (SCOPE) url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    redirect(res, url.toString());
}

async function handleCallback(res, query) {
    const state = query.get("state") || "";
    const login = pending.get(state);
    pending.delete(state);

    if (query.get("error")) {
        return send(
            res,
            400,
            page(
                `<p class="err">Authorization failed: <b>${escapeHtml(query.get("error"))}</b></p>
             <a class="button" href="/">Back</a>`,
            ),
        );
    }
    if (!login) {
        return send(
            res,
            400,
            page(
                `<p class="err">Unknown or reused <code>state</code> — possible CSRF, login aborted.</p>
             <a class="button" href="/">Back</a>`,
            ),
        );
    }

    const meta = await discover();
    const tokenRes = await fetch(meta.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: query.get("code") || "",
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: login.verifier,
        }),
    });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token.access_token) {
        return send(
            res,
            502,
            page(
                `<p class="err">Token exchange failed (HTTP ${tokenRes.status}):</p>
             <pre>${escapeHtml(JSON.stringify(token, null, 2))}</pre>
             <a class="button" href="/">Back</a>`,
            ),
        );
    }

    const profileRes = await fetch(meta.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : null;

    const sid = randomUUID();
    sessions.set(sid, {
        accessToken: token.access_token,
        tokenResponse: token,
        profile,
    });
    redirect(res, "/", {
        "Set-Cookie": `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`,
    });
}

async function handleGenerate(res, session) {
    const name =
        session.profile?.preferred_username ||
        session.profile?.name ||
        "friend";
    const genRes = await fetch(`${GEN_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [
                {
                    role: "user",
                    content: `Greet ${name} in one short, cheerful sentence.`,
                },
            ],
        }),
    });
    const data = await genRes.json().catch(() => ({}));
    const output = genRes.ok
        ? data.choices?.[0]?.message?.content || JSON.stringify(data)
        : JSON.stringify(data, null, 2);
    send(
        res,
        genRes.ok ? 200 : 502,
        page(
            `<p>${genRes.ok ? "Generated with your delegated key:" : '<span class="err">Generation failed:</span>'}</p>
         <pre>${escapeHtml(output)}</pre>
         <a class="button" href="/">Back</a>`,
        ),
    );
}

function handleHome(res, session) {
    if (!session) {
        const configured = CLIENT_ID
            ? ""
            : `<p class="err">Set <code>CLIENT_ID=pk_...</code> before logging in (see README).</p>`;
        return send(
            res,
            200,
            page(
                `<p>This app signs you in with your Pollinations account via
             OAuth 2.1 (authorization code + PKCE).</p>${configured}
             <a class="button" href="/login">Sign in with Pollinations</a>`,
            ),
        );
    }
    return send(
        res,
        200,
        page(
            `<p>Signed in as <b>${escapeHtml(
                session.profile?.preferred_username ||
                    session.profile?.name ||
                    session.profile?.sub ||
                    "unknown",
            )}</b></p>
         <h3>userinfo</h3><pre>${escapeHtml(JSON.stringify(session.profile, null, 2))}</pre>
         <h3>token response</h3><pre>${escapeHtml(
             JSON.stringify(
                 { ...session.tokenResponse, access_token: "sk_…redacted" },
                 null,
                 2,
             ),
         )}</pre>
         <form method="post" action="/generate"><button type="submit">Generate a greeting (spends pollen)</button></form>
         <p><a href="/logout">Log out</a></p>`,
        ),
    );
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const { sid, session } = getSession(req);
    try {
        if (url.pathname === "/" && req.method === "GET") {
            return handleHome(res, session);
        }
        if (url.pathname === "/login" && req.method === "GET") {
            return await handleLogin(res);
        }
        if (url.pathname === "/callback" && req.method === "GET") {
            return await handleCallback(res, url.searchParams);
        }
        if (url.pathname === "/generate" && req.method === "POST") {
            if (!session) return redirect(res, "/");
            return await handleGenerate(res, session);
        }
        if (url.pathname === "/logout" && req.method === "GET") {
            if (sid) sessions.delete(sid);
            return redirect(res, "/", {
                "Set-Cookie": "sid=; Max-Age=0; Path=/",
            });
        }
        send(res, 404, page("<p>Not found.</p>"));
    } catch (err) {
        send(
            res,
            500,
            page(
                `<p class="err">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`,
            ),
        );
    }
});

server.listen(PORT, () => {
    console.log(`Demo client:  http://localhost:${PORT}`);
    console.log(`Issuer:       ${ISSUER}`);
    console.log(
        `Client ID:    ${CLIENT_ID || "(unset — set CLIENT_ID=pk_...)"}`,
    );
    console.log(`Redirect URI: ${REDIRECT_URI}`);
});
