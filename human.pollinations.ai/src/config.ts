const DEFAULT_RESPONSE_TIMEOUT_MS = 270_000;
const MAX_RESPONSE_TIMEOUT_MS = 285_000;

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function responseTimeout(): number {
    const configured = Number(
        process.env.RESPONSE_TIMEOUT_MS ?? DEFAULT_RESPONSE_TIMEOUT_MS,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
        throw new Error("RESPONSE_TIMEOUT_MS must be a positive number");
    }
    return Math.min(configured, MAX_RESPONSE_TIMEOUT_MS);
}

export function readConfig() {
    return {
        apiToken: required("HUMAN_API_TOKEN"),
        discordToken: required("DISCORD_BOT_TOKEN"),
        guildId: required("DISCORD_GUILD_ID"),
        channelId: required("DISCORD_CHANNEL_ID"),
        responderRoleId: required("DISCORD_RESPONDER_ROLE_ID"),
        databasePath: process.env.DATABASE_PATH ?? "./human.sqlite",
        port: Number(process.env.PORT ?? 3000),
        responseTimeoutMs: responseTimeout(),
    };
}
