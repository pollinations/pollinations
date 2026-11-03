// GitHub for the runner: webhook signatures, a token for the Polly bot app,
// and the few REST calls its doors, facts and actions need.
const API = "https://api.github.com";
const encoder = new TextEncoder();

const base64url = (data) =>
    btoa(
        typeof data === "string"
            ? data
            : String.fromCharCode(...new Uint8Array(data)),
    )
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

export async function verifySignature(secret, body, header) {
    const hex = header?.startsWith("sha256=") ? header.slice(7) : "";
    if (!secret || !/^[0-9a-f]{64}$/i.test(hex)) return false;
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );
    const signature = Uint8Array.from(hex.match(/../g), (b) =>
        Number.parseInt(b, 16),
    );
    return crypto.subtle.verify("HMAC", key, signature, encoder.encode(body));
}

// The app's private key is stored as PKCS #8 PEM: convert GitHub's download
// once with `openssl pkcs8 -topk8 -nocrypt -in key.pem`.
async function appJwt(appId, pem) {
    const der = Uint8Array.from(
        atob(pem.replace(/-----[^-]+-----|\s/g, "")),
        (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
        JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
    )}`;
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        encoder.encode(unsigned),
    );
    return `${unsigned}.${base64url(signature)}`;
}

async function call(path, { token, method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "user-agent": "pollinations-runner",
            "x-github-api-version": "2022-11-28",
            ...(body && { "content-type": "application/json" }),
        },
        body: body && JSON.stringify(body),
    });
    if (!res.ok) {
        const error = new Error(`GitHub ${method} ${path} -> ${res.status}`);
        error.status = res.status;
        throw error;
    }
    return res.status === 204 ? null : res.json();
}

// The Worker signs in as the Polly bot app. A local run uses GITHUB_TOKEN
// instead, so it can read real issues without the app's key.
export async function githubClient(env, repo) {
    let token = env.GITHUB_TOKEN;
    let self;
    if (token) self = (await call("/user", { token })).login;
    else {
        const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
        const { id } = await call(`/repos/${repo}/installation`, {
            token: jwt,
        });
        ({ token } = await call(`/app/installations/${id}/access_tokens`, {
            token: jwt,
            method: "POST",
        }));
        self = `${(await call("/app", { token: jwt })).slug}[bot]`;
    }
    const get = (path) => call(path, { token });
    const all = async (path, pages = 5) => {
        const items = [];
        for (let page = 1; page <= pages; page++) {
            const batch = await get(`${path}&per_page=100&page=${page}`);
            items.push(...batch);
            if (batch.length < 100) break;
        }
        return items;
    };
    return {
        issue: (number) => get(`/repos/${repo}/issues/${number}`),
        user: (login) => get(`/users/${login}`),
        repo: (name) => get(`/repos/${name}`),
        tree: (name, branch) =>
            get(`/repos/${name}/git/trees/${branch}?recursive=1`),
        openIssues: (label) =>
            all(
                `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}`,
            ).then((items) => items.filter((i) => !i.pull_request)),
        async upsertComment(number, marker, body) {
            const mine = (
                await all(`/repos/${repo}/issues/${number}/comments?`)
            ).filter((c) => c.user?.login === self && c.body?.includes(marker));
            if (mine.length)
                await call(`/repos/${repo}/issues/comments/${mine.at(-1).id}`, {
                    token,
                    method: "PATCH",
                    body: { body },
                });
            else
                await call(`/repos/${repo}/issues/${number}/comments`, {
                    token,
                    method: "POST",
                    body: { body },
                });
        },
        // Removes every status label the route owns, then adds the new ones.
        async setStatusLabel(number, owned, add) {
            for (const name of owned) {
                try {
                    await call(
                        `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(name)}`,
                        { token, method: "DELETE" },
                    );
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
            }
            const labels = add.filter(Boolean);
            if (labels.length)
                await call(`/repos/${repo}/issues/${number}/labels`, {
                    token,
                    method: "POST",
                    body: { labels },
                });
        },
    };
}
