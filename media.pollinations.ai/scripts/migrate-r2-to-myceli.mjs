import { createHash } from "node:crypto";

const API_BASE = "https://api.cloudflare.com/client/v4";
const BUCKET = process.env.MEDIA_R2_BUCKET || "pollinations-media";
const MODE = process.env.MIGRATION_MODE || "precheck";
const JOB_ID = process.env.MIGRATION_JOB_ID || "";
const WAIT_SECONDS = Number(process.env.MIGRATION_WAIT_SECONDS || 1800);

const sourceToken = requiredEnv("CLOUDFLARE_API_TOKEN_SOURCE");
const sourceAccountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID_SOURCE");
const targetToken = requiredEnv("CLOUDFLARE_API_TOKEN_TARGET");
const targetAccountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID_TARGET");

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var ${name}`);
    return value;
}

async function cfRequest(token, path, init = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    const body = await response.json();
    if (!response.ok || body.success === false) {
        throw new Error(
            JSON.stringify(
                {
                    path,
                    status: response.status,
                    errors: body.errors,
                    messages: body.messages,
                },
                null,
                2,
            ),
        );
    }
    return body.result;
}

async function tokenId(token) {
    const result = await cfRequest(token, "/user/tokens/verify");
    return result.id;
}

function s3SecretAccessKey(token) {
    return createHash("sha256").update(token).digest("hex");
}

async function r2Credentials(token) {
    return {
        accessKeyId: await tokenId(token),
        secretAccessKey: s3SecretAccessKey(token),
    };
}

async function buildMigrationSpec() {
    const sourceSecret = await r2Credentials(sourceToken);
    const targetSecret = await r2Credentials(targetToken);

    return {
        source: {
            bucket: BUCKET,
            vendor: "s3",
            endpoint: `https://${sourceAccountId}.r2.cloudflarestorage.com`,
            region: "auto",
            secret: sourceSecret,
        },
        target: {
            bucket: BUCKET,
            vendor: "r2",
            jurisdiction: "default",
            secret: targetSecret,
        },
    };
}

async function precheck(spec) {
    console.log("Checking source bucket connectivity...");
    const source = await cfRequest(
        targetToken,
        `/accounts/${targetAccountId}/slurper/source/connectivity-precheck`,
        {
            method: "PUT",
            body: JSON.stringify(spec.source),
        },
    );
    console.log(`Source connectivity: ${source.connectivityStatus}`);

    console.log("Checking target bucket connectivity...");
    const target = await cfRequest(
        targetToken,
        `/accounts/${targetAccountId}/slurper/target/connectivity-precheck`,
        {
            method: "PUT",
            body: JSON.stringify(spec.target),
        },
    );
    console.log(`Target connectivity: ${target.connectivityStatus}`);
}

async function start(spec) {
    const result = await cfRequest(
        targetToken,
        `/accounts/${targetAccountId}/slurper/jobs`,
        {
            method: "POST",
            body: JSON.stringify({
                overwrite: false,
                source: spec.source,
                target: spec.target,
            }),
        },
    );
    console.log(`Started Super Slurper job: ${result.id}`);
    return result.id;
}

async function progress(jobId) {
    return cfRequest(
        targetToken,
        `/accounts/${targetAccountId}/slurper/jobs/${jobId}/progress`,
    );
}

function logProgress(result) {
    console.log(
        [
            `status=${result.status}`,
            `objects=${result.objects ?? 0}`,
            `transferred=${result.transferredObjects ?? 0}`,
            `skipped=${result.skippedObjects ?? 0}`,
            `failed=${result.failedObjects ?? 0}`,
        ].join(" "),
    );
}

async function waitForJob(jobId) {
    const deadline = Date.now() + WAIT_SECONDS * 1000;

    while (true) {
        const result = await progress(jobId);
        logProgress(result);

        if (result.status === "completed") {
            if ((result.failedObjects ?? 0) > 0) {
                throw new Error(
                    `Migration completed with ${result.failedObjects} failed objects`,
                );
            }
            return;
        }

        if (result.status === "aborted") {
            throw new Error(`Migration job ${jobId} was aborted`);
        }

        if (Date.now() >= deadline) {
            console.log(`Job ${jobId} is still running; check progress later.`);
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 30000));
    }
}

const spec = await buildMigrationSpec();

switch (MODE) {
    case "precheck":
        await precheck(spec);
        break;
    case "start": {
        await precheck(spec);
        const jobId = await start(spec);
        await waitForJob(jobId);
        break;
    }
    case "wait":
        if (!JOB_ID)
            throw new Error("MIGRATION_JOB_ID is required for wait mode");
        await waitForJob(JOB_ID);
        break;
    case "status":
        if (!JOB_ID)
            throw new Error("MIGRATION_JOB_ID is required for status mode");
        logProgress(await progress(JOB_ID));
        break;
    default:
        throw new Error(`Unknown MIGRATION_MODE: ${MODE}`);
}
