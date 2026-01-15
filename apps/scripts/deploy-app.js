#!/usr/bin/env node

/**
 * Deploy app to Cloudflare Pages + custom subdomain
 *
 * Usage: node deploy-app.js <appName>
 */

const fs = require("fs");
const path = require("path");

/**
 * Load credentials from .env file or environment
 */
function loadCredentials() {
    let apiToken = process.env.CLOUDFLARE_API_TOKEN;
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    let turnstileId = process.env.TURNSTILE_SITE_ID;

    // Try to load from apps .env file if not in environment
    if (!apiToken || !accountId || !turnstileId) {
        const envPath = path.join(__dirname, "../.env");

        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, "utf8");

            if (!apiToken) {
                const tokenMatch = envContent.match(
                    /CLOUDFLARE_API_TOKEN=(.+)/,
                );
                if (tokenMatch) {
                    apiToken = tokenMatch[1].trim();
                    console.log("✅ Loaded CLOUDFLARE_API_TOKEN from .env");
                }
            }

            if (!accountId) {
                const accountMatch = envContent.match(
                    /CLOUDFLARE_ACCOUNT_ID=(.+)/,
                );
                if (accountMatch) {
                    accountId = accountMatch[1].trim();
                    console.log("✅ Loaded CLOUDFLARE_ACCOUNT_ID from .env");
                }
            }

            if (!turnstileId) {
                const turnstileMatch = envContent.match(
                    /TURNSTILE_SITE_ID=(.+)/,
                );
                if (turnstileMatch) {
                    turnstileId = turnstileMatch[1].trim();
                    console.log("✅ Loaded TURNSTILE_SITE_ID from .env");
                }
            }
        }
    }

    return { apiToken, accountId, turnstileId };
}

const {
    apiToken: CLOUDFLARE_API_TOKEN,
    accountId: CLOUDFLARE_ACCOUNT_ID,
    turnstileId: TURNSTILE_SITE_ID,
} = loadCredentials();

// Cloudflare Zone ID for pollinations.ai
const CLOUDFLARE_ZONE_ID = "0942247b74a58e4fc5ea70341a3754a3";

async function deployApp(appName) {
    console.log(`🚀 Deploying ${appName}...`);

    // Load config
    const configPath = path.join(__dirname, "../apps.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const appConfig = config[appName];

    if (!appConfig) {
        throw new Error(`App ${appName} not found in apps.json`);
    }

    const subdomain = appConfig.subdomain || appName;
    // Special case: gsoc doesn't get the pollinations- prefix
    const projectName = appName === 'gsoc' 
      ? 'gsoc' 
      : `pollinations-${subdomain}`;
    const customDomain = `${subdomain}.pollinations.ai`;

    console.log(`📦 Project: ${projectName}`);
    console.log(`🌐 Domain: ${customDomain}`);

    // Step 1: Create Pages project
    console.log("\n1️⃣ Creating Cloudflare Pages project...");
    const createResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: projectName,
                production_branch: "production",
                build_config: {
                    build_command: appConfig.buildCommand || "",
                    destination_dir: appConfig.outputDir || ".",
                },
            }),
        },
    );

    const createResult = await createResponse.json();

    if (
        !createResponse.ok &&
        !createResult.errors?.some((e) => e.code === 8000002)
    ) {
        // 8000002 = project already exists
        throw new Error(
            `Failed to create project: ${JSON.stringify(createResult)}`,
        );
    }

    console.log("✅ Project created/exists");

    // Step 2: Add custom domain
    console.log("\n2️⃣ Adding custom domain...");
    const domainResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: customDomain,
            }),
        },
    );

    const domainResult = await domainResponse.json();

    if (
        !domainResponse.ok &&
        !domainResult.errors?.some((e) => e.code === 8000007)
    ) {
        // 8000007 = domain already exists
        console.warn(`⚠️  Domain setup: ${JSON.stringify(domainResult)}`);
    } else {
        console.log("✅ Custom domain added");
    }

    // Step 3: Create DNS CNAME record
    console.log("\n3️⃣ Creating DNS CNAME record...");
    const dnsResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                type: "CNAME",
                name: subdomain,
                content: `${projectName}.pages.dev`,
                ttl: 1,
                proxied: true,
            }),
        },
    );

    const dnsResult = await dnsResponse.json();

    if (!dnsResponse.ok && !dnsResult.errors?.some((e) => e.code === 81057)) {
        // 81057 = DNS record already exists
        console.warn(`⚠️  DNS setup: ${JSON.stringify(dnsResult)}`);
    } else {
        console.log("✅ DNS CNAME record created");
    }

    // Step 4: Update Turnstile (placeholder - needs actual API)
    console.log("\n4️⃣ Updating Turnstile allowlist...");
    console.log(
        `⚠️  Manual step: Add ${customDomain} to Turnstile widget ${TURNSTILE_SITE_ID}`,
    );
    console.log("   https://dash.cloudflare.com/?to=/:account/turnstile");

    console.log(`\n✨ Deployment complete!`);
    console.log(`🔗 App will be available at: https://${customDomain}`);
    console.log(
        `📝 Next: Upload files to project via Wrangler or Direct Upload API`,
    );
}

// CLI
const appName = process.argv[2];
if (!appName) {
    console.error("Usage: node deploy-app.js <appName>");
    process.exit(1);
}

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
    console.error(
        "❌ Missing required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID",
    );
    process.exit(1);
}

deployApp(appName).catch((err) => {
    console.error("❌ Deployment failed:", err.message);
    process.exit(1);
});
