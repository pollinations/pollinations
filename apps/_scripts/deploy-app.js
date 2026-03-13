#!/usr/bin/env node

/**
 * Deploy app to Cloudflare Pages + custom subdomain
 *
 * Usage: node deploy-app.js <appName>
 */

const fs = require("node:fs");
const path = require("node:path");

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

const CF_API = "https://api.cloudflare.com/client/v4";
const cfHeaders = {
    "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
};

/**
 * Find which Pages project holds a custom domain and move it to the target project.
 * Lists all projects, checks their domains, removes from the old, adds to the new.
 */
async function reclaimDomain(customDomain, targetProject) {
    // List all Pages projects
    const res = await fetch(
        `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects?per_page=50`,
        { headers: cfHeaders },
    );
    const { result: projects } = await res.json();

    for (const project of projects || []) {
        if (project.name === targetProject) continue;

        // Check if this project holds the domain
        const domainsRes = await fetch(
            `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project.name}/domains`,
            { headers: cfHeaders },
        );
        const { result: domains } = await domainsRes.json();
        const hasDomain = domains?.some((d) => d.name === customDomain);
        if (!hasDomain) continue;

        console.log(`   Found domain on old project: ${project.name} — removing...`);
        const deleteRes = await fetch(
            `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project.name}/domains/${customDomain}`,
            { method: "DELETE", headers: cfHeaders },
        );

        if (!deleteRes.ok) {
            const err = await deleteRes.json();
            console.warn(`   Failed to remove from ${project.name}: ${JSON.stringify(err)}`);
            return false;
        }
        console.log(`   Removed from ${project.name}`);

        // Now add to target project
        const addRes = await fetch(
            `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${targetProject}/domains`,
            {
                method: "POST",
                headers: cfHeaders,
                body: JSON.stringify({ name: customDomain }),
            },
        );

        if (!addRes.ok) {
            const err = await addRes.json();
            console.warn(`   Failed to add to ${targetProject}: ${JSON.stringify(err)}`);
            return false;
        }
        console.log(`   ✅ Domain reclaimed and added to ${targetProject}`);
        return true;
    }

    console.warn(`   Could not find domain ${customDomain} on any project`);
    return false;
}

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
    const projectName = `apps-${subdomain}`;
    const customDomain = `${subdomain}.pollinations.ai`;

    console.log(`📦 Project: ${projectName}`);
    console.log(`🌐 Domain: ${customDomain}`);

    // Step 1: Create Pages project
    console.log("\n1️⃣ Creating Cloudflare Pages project...");
    const createResponse = await fetch(
        `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
        {
            method: "POST",
            headers: cfHeaders,
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

    // Step 2: Add custom domain (remove from old projects first if needed)
    console.log("\n2️⃣ Adding custom domain...");
    const domainResponse = await fetch(
        `${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
        {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
                name: customDomain,
            }),
        },
    );

    const domainResult = await domainResponse.json();

    if (domainResponse.ok || domainResult.errors?.some((e) => e.code === 8000007)) {
        console.log("✅ Custom domain added");
    } else if (domainResult.errors?.some((e) => e.code === 8000018)) {
        // 8000018 = domain already added to another project — find and remove it
        console.log("⚠️  Domain claimed by another project, attempting to reclaim...");
        const reclaimed = await reclaimDomain(customDomain, projectName);
        if (!reclaimed) {
            console.warn(`⚠️  Could not reclaim domain: ${JSON.stringify(domainResult)}`);
        }
    } else {
        console.warn(`⚠️  Domain setup: ${JSON.stringify(domainResult)}`);
    }

    // Step 3: Create or update DNS CNAME record
    console.log("\n3️⃣ Setting up DNS CNAME record...");
    const cnamTarget = `${projectName}.pages.dev`;
    const dnsResponse = await fetch(
        `${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
                type: "CNAME",
                name: subdomain,
                content: cnamTarget,
                ttl: 1,
                proxied: true,
            }),
        },
    );

    const dnsResult = await dnsResponse.json();

    if (dnsResponse.ok) {
        console.log("✅ DNS CNAME record created");
    } else if (dnsResult.errors?.some((e) => e.code === 81053 || e.code === 81057)) {
        // Record already exists — find it and update to point to the correct project
        console.log("   DNS record exists, updating target...");
        const listRes = await fetch(
            `${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=CNAME&name=${customDomain}`,
            { headers: cfHeaders },
        );
        const { result: records } = await listRes.json();
        const record = records?.[0];
        if (record && record.content !== cnamTarget) {
            const updateRes = await fetch(
                `${CF_API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`,
                {
                    method: "PATCH",
                    headers: cfHeaders,
                    body: JSON.stringify({ content: cnamTarget }),
                },
            );
            if (updateRes.ok) {
                console.log(`   ✅ Updated CNAME: ${record.content} → ${cnamTarget}`);
            } else {
                console.warn(`   ⚠️  Failed to update DNS: ${JSON.stringify(await updateRes.json())}`);
            }
        } else {
            console.log("✅ DNS CNAME already correct");
        }
    } else {
        console.warn(`⚠️  DNS setup: ${JSON.stringify(dnsResult)}`);
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
