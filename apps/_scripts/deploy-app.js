#!/usr/bin/env node

/**
 * Provision Cloudflare routing for an app in two phases:
 *
 *   --phase=origin   Create the Myceli Pages project, add <sub>.myceli.ai,
 *                    and upsert the myceli.ai DNS CNAME.
 *   --phase=cutover  After upload and origin verification, add
 *                    <sub>.pollinations.ai directly to the Myceli Pages project.
 *
 * Usage: node deploy-app.js <appName> --phase=origin|cutover
 */

const fs = require("node:fs");
const path = require("node:path");

const CF_API = "https://api.cloudflare.com/client/v4";
const PUBLIC_ZONE = "pollinations.ai";
const UPSTREAM_ZONE = "myceli.ai";

function loadEnvFile() {
    const envPath = path.join(__dirname, "../.env");
    if (!fs.existsSync(envPath)) return;

    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].trim();
        }
    }
}

function loadCredentials() {
    loadEnvFile();
    return {
        mycToken:
            process.env.CLOUDFLARE_API_TOKEN_MYCELI ||
            process.env.CLOUDFLARE_API_TOKEN,
        mycAccount:
            process.env.CLOUDFLARE_ACCOUNT_ID_MYCELI ||
            process.env.CLOUDFLARE_ACCOUNT_ID,
    };
}

const headersFor = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
});

async function cf(url, headers, init = {}) {
    const res = await fetch(url, { headers, ...init });
    let json = {};
    try {
        json = await res.json();
    } catch {
        // Some DELETE responses are empty.
    }
    return { ok: res.ok && json.success !== false, json };
}

const hasCode = (json, ...codes) =>
    json.errors?.some((error) => codes.includes(error.code));

async function resolveZoneId(zoneName, headers) {
    const { json } = await cf(`${CF_API}/zones?name=${zoneName}`, headers);
    const zone = json.result?.[0];
    if (!zone) throw new Error(`Zone not found: ${zoneName}`);
    return zone.id;
}

async function createPagesProject(account, headers, project, appConfig) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects`,
        headers,
        {
            method: "POST",
            body: JSON.stringify({
                name: project,
                production_branch: "production",
                build_config: {
                    build_command: appConfig.buildCommand || "",
                    destination_dir: appConfig.outputDir || ".",
                },
            }),
        },
    );

    if (ok || hasCode(json, 8000002)) {
        console.log(`Pages project ready: ${project}`);
        return;
    }

    throw new Error(
        `Create project ${project} failed: ${JSON.stringify(json)}`,
    );
}

async function getPagesProject(account, headers, project) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects/${project}`,
        headers,
    );
    if (!ok) {
        throw new Error(
            `Get project ${project} failed: ${JSON.stringify(json)}`,
        );
    }
    return json.result;
}

async function detachPagesDomain(account, headers, customDomain) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects`,
        headers,
    );
    if (!ok) {
        throw new Error(`List Pages projects failed: ${JSON.stringify(json)}`);
    }

    for (const project of json.result || []) {
        const detached = await detachPagesDomainFromProject(
            account,
            headers,
            project.name,
            customDomain,
        );

        if (detached) return;
    }
}

async function detachPagesDomainFromProject(
    account,
    headers,
    project,
    customDomain,
) {
    const { ok: listOk, json: domains } = await cf(
        `${CF_API}/accounts/${account}/pages/projects/${project}/domains`,
        headers,
    );
    if (!listOk) {
        throw new Error(
            `List domains for ${project} failed: ${JSON.stringify(domains)}`,
        );
    }

    if (!domains.result?.some((domain) => domain.name === customDomain)) {
        return false;
    }

    const { ok: deleteOk, json: deleted } = await cf(
        `${CF_API}/accounts/${account}/pages/projects/${project}/domains/${customDomain}`,
        headers,
        { method: "DELETE" },
    );
    if (!deleteOk) {
        throw new Error(
            `Detach ${customDomain} from ${project} failed: ${JSON.stringify(deleted)}`,
        );
    }

    console.log(`Detached ${customDomain} from ${project}`);
    return true;
}

async function projectHasPagesDomain(account, headers, project, customDomain) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects/${project}/domains`,
        headers,
    );
    if (!ok) {
        throw new Error(
            `List domains for ${project} failed: ${JSON.stringify(json)}`,
        );
    }

    return json.result?.some((domain) => domain.name === customDomain);
}

async function addPagesDomain(account, headers, project, customDomain) {
    if (await projectHasPagesDomain(account, headers, project, customDomain)) {
        console.log(`Pages custom domain ready: ${customDomain}`);
        return;
    }

    const postDomain = () =>
        cf(
            `${CF_API}/accounts/${account}/pages/projects/${project}/domains`,
            headers,
            {
                method: "POST",
                body: JSON.stringify({ name: customDomain }),
            },
        );

    let { ok, json } = await postDomain();
    if (ok || hasCode(json, 8000007)) {
        console.log(`Pages custom domain ready: ${customDomain}`);
        return;
    }

    if (hasCode(json, 8000018)) {
        console.log(`${customDomain} claimed elsewhere; reclaiming`);
        await detachPagesDomain(account, headers, customDomain);
        ({ ok, json } = await postDomain());
        if (ok || hasCode(json, 8000007)) {
            console.log(`Pages custom domain reclaimed: ${customDomain}`);
            return;
        }
    }

    throw new Error(
        `Add Pages domain ${customDomain} failed: ${JSON.stringify(json)}`,
    );
}

async function upsertCname(zoneId, headers, name, target) {
    const { ok, json } = await cf(
        `${CF_API}/zones/${zoneId}/dns_records`,
        headers,
        {
            method: "POST",
            body: JSON.stringify({
                type: "CNAME",
                name,
                content: target,
                ttl: 1,
                proxied: false,
            }),
        },
    );

    if (ok) {
        console.log(`DNS CNAME ready: ${name} -> ${target}`);
        return;
    }

    if (hasCode(json, 81053, 81057)) {
        const { ok: listOk, json: list } = await cf(
            `${CF_API}/zones/${zoneId}/dns_records?type=CNAME&name=${name}`,
            headers,
        );
        if (!listOk) {
            throw new Error(`DNS list ${name} failed: ${JSON.stringify(list)}`);
        }

        const record = list.result?.[0];
        if (!record) {
            throw new Error(
                `DNS conflict for ${name}, but no CNAME was found: ${JSON.stringify(json)}`,
            );
        }

        if (record.content === target && record.proxied === false) {
            console.log(`DNS CNAME already correct: ${name}`);
            return;
        }

        const { ok: updateOk, json: updated } = await cf(
            `${CF_API}/zones/${zoneId}/dns_records/${record.id}`,
            headers,
            {
                method: "PATCH",
                body: JSON.stringify({ content: target, proxied: false }),
            },
        );
        if (!updateOk) {
            throw new Error(
                `DNS update ${name} failed: ${JSON.stringify(updated)}`,
            );
        }
        console.log(`DNS CNAME updated: ${name} -> ${target}`);
        return;
    }

    throw new Error(`DNS upsert ${name} failed: ${JSON.stringify(json)}`);
}

function appContext(appName) {
    const config = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../apps.json"), "utf8"),
    );
    const appConfig = config[appName];
    if (!appConfig) throw new Error(`App ${appName} not found in apps.json`);

    const subdomain = appConfig.subdomain || appName;
    return {
        appConfig,
        subdomain,
        project: `apps-${subdomain}`,
        originDomain: `${subdomain}.${UPSTREAM_ZONE}`,
        publicDomain: `${subdomain}.${PUBLIC_ZONE}`,
    };
}

async function runOrigin(appName) {
    const { appConfig, project, originDomain } = appContext(appName);
    console.log(`Myceli origin: ${originDomain}`);

    const myceliHeaders = headersFor(MYC_TOKEN);
    const myceliZoneId = await resolveZoneId(UPSTREAM_ZONE, myceliHeaders);
    await createPagesProject(MYC_ACCOUNT, myceliHeaders, project, appConfig);
    const pagesProject = await getPagesProject(
        MYC_ACCOUNT,
        myceliHeaders,
        project,
    );
    await addPagesDomain(MYC_ACCOUNT, myceliHeaders, project, originDomain);
    await upsertCname(
        myceliZoneId,
        myceliHeaders,
        originDomain,
        pagesProject.subdomain || `${project}.pages.dev`,
    );

    console.log(`Origin provisioned: https://${originDomain}`);
}

async function runCutover(appName) {
    const { project, publicDomain, originDomain } = appContext(appName);
    console.log(`Public cutover: ${publicDomain} -> ${originDomain}`);

    const myceliHeaders = headersFor(MYC_TOKEN);
    const publicZoneId = await resolveZoneId(PUBLIC_ZONE, myceliHeaders);
    const pagesProject = await getPagesProject(
        MYC_ACCOUNT,
        myceliHeaders,
        project,
    );
    await addPagesDomain(MYC_ACCOUNT, myceliHeaders, project, publicDomain);
    await upsertCname(
        publicZoneId,
        myceliHeaders,
        publicDomain,
        pagesProject.subdomain || `${project}.pages.dev`,
    );

    console.log(`Public routing ready: https://${publicDomain}`);
}

const { mycToken: MYC_TOKEN, mycAccount: MYC_ACCOUNT } = loadCredentials();

const appName = process.argv[2];
const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg ? phaseArg.split("=")[1] : "";

if (!appName || (phase !== "origin" && phase !== "cutover")) {
    console.error("Usage: node deploy-app.js <appName> --phase=origin|cutover");
    process.exit(1);
}

if (!MYC_TOKEN || !MYC_ACCOUNT) {
    console.error(
        "Missing Myceli creds (CLOUDFLARE_API_TOKEN_MYCELI / CLOUDFLARE_ACCOUNT_ID_MYCELI)",
    );
    process.exit(1);
}

const run = phase === "origin" ? runOrigin : runCutover;
run(appName).catch((error) => {
    console.error(`${phase} failed:`, error.message);
    process.exit(1);
});
