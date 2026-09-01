import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { TokenStore, validToken } from "./store.js";

export const APP_KEY = process.env.APP_KEY ?? "";
export const MODEL_ID = "AkshayCoder48/researcher";
export const ENTER_URL = "https://enter.pollinations.ai";
export const GEN_URL = "https://gen.pollinations.ai";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const MAX_QUESTION_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = 12_000;

export class UserFacingError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function validAppKey(value) {
    return (
        typeof value === "string" && /^pk_[A-Za-z0-9._~-]+$/.test(value.trim())
    );
}

function safeText(value, max) {
    return Array.from(value)
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code >= 32 && code !== 127;
        })
        .join("")
        .trim()
        .slice(0, max);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(
    url,
    init,
    { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let response;
        try {
            response = await fetchImpl(url, {
                ...init,
                signal: controller.signal,
            });
        } catch {
            throw new UserFacingError("network");
        }
        let body = {};
        try {
            body = await response.json();
        } catch {
            body = {};
        }
        return { ok: response.ok, status: response.status, body };
    } finally {
        clearTimeout(timer);
    }
}

export async function requestDeviceCode({
    appKey,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
    if (!validAppKey(appKey)) throw new UserFacingError("configuration");
    const result = await requestJson(
        `${ENTER_URL}/api/device/code`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: appKey.trim(), scope: "usage" }),
        },
        { fetchImpl, timeoutMs },
    );
    const body = result.body;
    if (
        !result.ok ||
        typeof body.device_code !== "string" ||
        typeof body.verification_uri_complete !== "string"
    ) {
        throw new UserFacingError("start");
    }
    const interval = Number(body.interval);
    const expiresIn = Number(body.expires_in);
    if (
        !Number.isFinite(interval) ||
        !Number.isFinite(expiresIn) ||
        interval < 0 ||
        expiresIn <= 0
    ) {
        throw new UserFacingError("start");
    }
    return {
        deviceCode: body.device_code,
        verificationUri: body.verification_uri_complete,
        userCode: typeof body.user_code === "string" ? body.user_code : null,
        interval,
        expiresIn,
    };
}

export async function pollDeviceToken({
    deviceCode,
    interval,
    expiresIn,
    fetchImpl = fetch,
    sleep = delay,
    now = Date.now,
    timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
    if (
        typeof deviceCode !== "string" ||
        !Number.isFinite(expiresIn) ||
        expiresIn <= 0
    ) {
        throw new UserFacingError("configuration");
    }
    const deadline = now() + expiresIn * 1000;
    let waitSeconds = Math.max(1, Number(interval) || 5);
    while (now() < deadline) {
        await sleep(
            Math.min(waitSeconds * 1000, Math.max(0, deadline - now())),
        );
        if (now() >= deadline) break;
        const result = await requestJson(
            `${ENTER_URL}/api/device/token`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_code: deviceCode,
                    grant_type: DEVICE_GRANT,
                }),
            },
            { fetchImpl, timeoutMs },
        );
        const body = result.body;
        if (result.ok && validToken(body.access_token))
            return body.access_token;
        switch (body.error) {
            case "authorization_pending":
                continue;
            case "slow_down":
                waitSeconds += 5;
                continue;
            case "access_denied":
                throw new UserFacingError("denied");
            case "expired_token":
                throw new UserFacingError("expired");
            default:
                throw new UserFacingError("poll");
        }
    }
    throw new UserFacingError("expired");
}

export function errorMessage(error) {
    if (error instanceof UserFacingError) {
        return (
            {
                configuration:
                    "This bot is not configured with a valid APP_KEY.",
                network: "Pollinations could not be reached. Please try again.",
                start: "Pollinations could not start sign-in. Please try again.",
                poll: "Sign-in failed. Please start /connect again.",
                denied: "Authorization was denied. Run /connect if you want to try again.",
                expired:
                    "The sign-in code expired. Run /connect to get a new one.",
                ask: "Pollinations could not answer right now. Please try again.",
            }[error.code] ?? "Something went wrong. Please try again."
        );
    }
    return "Something went wrong. Please try again.";
}

function answerText(body) {
    const content = body?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim()
        ? safeText(content, MAX_ANSWER_LENGTH)
        : null;
}

export async function askAgent(
    question,
    accessToken,
    { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
    const prompt = safeText(question, MAX_QUESTION_LENGTH);
    if (!prompt || !validToken(accessToken)) throw new UserFacingError("ask");
    const result = await requestJson(
        `${GEN_URL}/v1/chat/completions`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                model: MODEL_ID,
                messages: [{ role: "user", content: prompt }],
            }),
        },
        { fetchImpl, timeoutMs },
    );
    const answer = result.ok ? answerText(result.body) : null;
    if (!answer) throw new UserFacingError("ask");
    return answer;
}

async function defer(interaction, privateResponse) {
    await interaction.deferReply(privateResponse ? { ephemeral: true } : {});
}

export async function handleCommand(
    interaction,
    {
        appKey = APP_KEY,
        store,
        fetchImpl = fetch,
        sleep = delay,
        now = Date.now,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = {},
) {
    if (!interaction.isChatInputCommand?.() || !store) return;
    const privateResponse = Boolean(interaction.guildId);
    if (interaction.commandName === "connect") {
        await defer(interaction, privateResponse);
        try {
            const device = await requestDeviceCode({
                appKey,
                fetchImpl,
                timeoutMs,
            });
            const code = device.userCode ? ` (code: ${device.userCode})` : "";
            await interaction.editReply({
                content: `Open ${device.verificationUri}${code} to authorize this Discord account. Waiting for approval…`,
            });
            const accessToken = await pollDeviceToken({
                deviceCode: device.deviceCode,
                interval: device.interval,
                expiresIn: device.expiresIn,
                fetchImpl,
                sleep,
                now,
                timeoutMs,
            });
            await store.set(interaction.user.id, accessToken);
            await interaction.editReply({
                content: "Connected. You can now use /ask.",
            });
        } catch (error) {
            await interaction.editReply({ content: errorMessage(error) });
        }
        return;
    }
    if (interaction.commandName === "disconnect") {
        await defer(interaction, privateResponse);
        await store.delete(interaction.user.id);
        await interaction.editReply({
            content:
                "Disconnected this Discord account locally. To revoke the server-side key, open https://enter.pollinations.ai/keys and revoke it there.",
        });
        return;
    }
    if (interaction.commandName === "ask") {
        await defer(interaction, false);
        try {
            const token = await store.get(interaction.user.id);
            if (!token) {
                await interaction.editReply({
                    content:
                        "Connect first with /connect; the authorization link is private.",
                });
                return;
            }
            const question = interaction.options.getString("question", true);
            await interaction.editReply({
                content: await askAgent(question, token, {
                    fetchImpl,
                    timeoutMs,
                }),
            });
        } catch (error) {
            await interaction.editReply({ content: errorMessage(error) });
        }
    }
}

export function createClient(options = {}) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const store =
        options.store ??
        new TokenStore(process.env.TOKEN_STORE_PATH ?? "./tokens.json");
    client.once(Events.ClientReady, (ready) =>
        console.log(`Logged in as ${ready.user.tag}`),
    );
    client.on(Events.InteractionCreate, (interaction) => {
        handleCommand(interaction, { ...options, store }).catch(() => {
            if (
                interaction.isRepliable?.() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                interaction
                    .reply({
                        content: "Something went wrong. Please try again.",
                        ephemeral: Boolean(interaction.guildId),
                    })
                    .catch(() => {});
            }
        });
    });
    return client;
}

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
    if (!process.env.DISCORD_TOKEN || !validAppKey(APP_KEY)) {
        console.error(
            "DISCORD_TOKEN and a valid APP_KEY (pk_...) are required",
        );
        process.exit(1);
    }
    createClient().login(process.env.DISCORD_TOKEN);
}

export {
    validAppKey,
    requestJson,
    safeText,
    MAX_QUESTION_LENGTH,
    MAX_ANSWER_LENGTH,
};
