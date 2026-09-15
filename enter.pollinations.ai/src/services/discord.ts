const POLLINATIONS_DISCORD_GUILD_ID = "885844321461485618";
const DISCORD_MEMBERSHIP_CACHE_TTL_SECONDS = 60;

type DiscordBindings = CloudflareBindings & {
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_BOT_TOKEN?: string;
};

type DiscordConfig = {
    clientId: string;
    clientSecret: string;
    botToken: string;
};

type CachedDiscordMembership = {
    member: boolean;
};

export function discordConfigFromEnv(env: object): DiscordConfig | null {
    const bindings = env as DiscordBindings;
    const clientId = bindings.DISCORD_CLIENT_ID?.trim();
    const clientSecret = bindings.DISCORD_CLIENT_SECRET?.trim();
    const botToken = bindings.DISCORD_BOT_TOKEN?.trim();
    return clientId && clientSecret && botToken
        ? { clientId, clientSecret, botToken }
        : null;
}

export async function isPollinationsDiscordMember(
    env: CloudflareBindings,
    userId: string,
): Promise<boolean> {
    const config = discordConfigFromEnv(env);
    if (!config) return false;

    const account = await env.DB.prepare(
        `SELECT account_id AS accountId
         FROM account
         WHERE user_id = ? AND provider_id = 'discord'
         LIMIT 1`,
    )
        .bind(userId)
        .first<{ accountId: string }>();

    if (!account) return false;

    const cacheKey = `discord:membership:${account.accountId}`;
    const cached = await env.KV.get<CachedDiscordMembership>(
        cacheKey,
        "json",
    ).catch(() => null);
    if (cached) return cached.member;

    const response = await fetch(
        `https://discord.com/api/v10/guilds/${POLLINATIONS_DISCORD_GUILD_ID}/members/${account.accountId}`,
        {
            headers: {
                Authorization: `Bot ${config.botToken}`,
            },
        },
    );

    if (response.status === 429) {
        throw new Error("Discord membership lookup is rate limited");
    }

    if (response.status === 404) {
        const body = (await response.json().catch(() => null)) as {
            code?: unknown;
        } | null;
        if (body?.code !== 10007) {
            throw new Error(
                `Discord membership check failed: 404 code=${String(body?.code ?? "unknown")}`,
            );
        }
        const membership = { member: false };
        await env.KV.put(cacheKey, JSON.stringify(membership), {
            expirationTtl: DISCORD_MEMBERSHIP_CACHE_TTL_SECONDS,
        }).catch(() => undefined);
        return false;
    }
    if (!response.ok) {
        throw new Error(`Discord membership check failed: ${response.status}`);
    }

    const membership = { member: true };
    await env.KV.put(cacheKey, JSON.stringify(membership), {
        expirationTtl: DISCORD_MEMBERSHIP_CACHE_TTL_SECONDS,
    }).catch(() => undefined);
    return true;
}
