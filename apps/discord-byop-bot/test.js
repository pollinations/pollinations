/**
 * Reproducible connect → use → disconnect demo (no Discord required).
 *
 * Demonstrates the full BYOP device flow against the real Pollinations API:
 *   1. Start device flow → print verification URL + user code
 *   2. Wait for user to approve in browser
 *   3. Call text generation with the issued token
 *   4. Call image generation with the issued token
 *   5. Revoke (disconnect) the token via the account keys API
 *
 * Run:
 *   APP_KEY=pk_... node test.js
 */

const ENTER_URL = process.env.ENTER_URL ?? "https://enter.pollinations.ai";
const GEN_URL = process.env.GEN_URL ?? "https://gen.pollinations.ai";
const APP_KEY = process.env.APP_KEY ?? "";

if (!APP_KEY) {
    console.error("APP_KEY=pk_... is required");
    process.exit(1);
}

// ── Step 1: Start device flow ────────────────────────────────────────────────

console.log("Step 1: Starting device authorization flow…\n");

const codeRes = await fetch(`${ENTER_URL}/api/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: APP_KEY }).toString(),
});

if (!codeRes.ok) {
    console.error("Failed to start device flow:", await codeRes.text());
    process.exit(1);
}

const code = await codeRes.json();

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(
    `  Visit: ${code.verification_uri_complete ?? `${ENTER_URL}/device`}`,
);
console.log(`  Code:  ${code.user_code}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("\nWaiting for authorization… (approve in your browser)\n");

// ── Step 2: Poll for token ───────────────────────────────────────────────────

let intervalMs = Math.max(code.interval ?? 5, 5) * 1000;
const expiresAt = Date.now() + (code.expires_in ?? 300) * 1000;
let accessToken = null;

while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const tokenRes = await fetch(`${ENTER_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: code.device_code,
            client_id: APP_KEY,
        }).toString(),
    });

    const body = await tokenRes.json().catch(() => ({}));

    if (tokenRes.ok && body.access_token) {
        accessToken = body.access_token;
        break;
    }
    if (body.error === "authorization_pending") {
        process.stdout.write(".");
        continue;
    }
    if (body.error === "slow_down") {
        intervalMs += 5000;
        continue;
    }
    console.error(
        "\nDevice flow error:",
        body.error,
        body.error_description ?? "",
    );
    process.exit(1);
}

if (!accessToken) {
    console.error("\nDevice code expired before authorization.");
    process.exit(1);
}

// Identify the user — but never log the token itself
const userRes = await fetch(`${ENTER_URL}/api/device/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
});
const userInfo = userRes.ok ? await userRes.json() : {};
console.log(
    `\n✅ Authorized as: ${userInfo.preferred_username ?? userInfo.name ?? userInfo.sub ?? "unknown"}\n`,
);

// ── Step 3: Generate text ────────────────────────────────────────────────────

console.log("Step 3: Generating text (spends your Pollen)…\n");

const textRes = await fetch(`${GEN_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
        model: "openai-fast",
        messages: [
            {
                role: "user",
                content: "Say hello from Pollinations in one sentence.",
            },
        ],
    }),
});

const textData = await textRes.json().catch(() => ({}));
if (!textRes.ok) {
    console.error("Text generation failed:", textData);
    process.exit(1);
}
const reply = textData.choices?.[0]?.message?.content ?? "(empty)";
console.log("Response:", reply, "\n");

// ── Step 4: Generate image ───────────────────────────────────────────────────

console.log("Step 4: Generating image (spends your Pollen)…\n");

const prompt = "a sunflower field at sunset";
const imageUrl = `${GEN_URL}/image/${encodeURIComponent(prompt)}?model=flux&nologo=true`;
const imageRes = await fetch(imageUrl, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${accessToken}` },
});
if (!imageRes.ok) {
    console.error("Image generation failed:", imageRes.status);
    process.exit(1);
}
console.log("Image URL:", imageRes.url || imageUrl, "\n");

// ── Step 5: Disconnect ───────────────────────────────────────────────────────

console.log("Step 5: Disconnect — revoking the token…\n");

// List keys to find the one we just issued
const keysRes = await fetch(`${ENTER_URL}/account/keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
});
if (keysRes.ok) {
    const keys = await keysRes.json().catch(() => []);
    const ours = Array.isArray(keys)
        ? keys.find(
              (k) =>
                  k.token === accessToken ||
                  k.prefix === accessToken.slice(0, 12),
          )
        : null;
    if (ours?.id) {
        const del = await fetch(`${ENTER_URL}/account/keys/${ours.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log(
            del.ok ? "✅ Token revoked." : `Revoke response: ${del.status}`,
        );
    } else {
        console.log(
            "Token will expire naturally (revocation endpoint unavailable).",
        );
    }
} else {
    console.log("Token will expire naturally (could not list keys).");
}

console.log("\nDemo complete.");
