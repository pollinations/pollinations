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

/** A linked Discord account that is in the Pollinations server. */
type PollinationsDiscordMember = {
    discordId: string;
    roles: string[];
};

type CachedDiscordMember = {
    roles: string[] | null;
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

/**
 * Returns the user's linked Discord account and its server role ids, or null
 * when no Discord account is linked or it is not in the Pollinations server.
 */
export async function getPollinationsDiscordMember(
    env: CloudflareBindings,
    userId: string,
): Promise<PollinationsDiscordMember | null> {
    const config = discordConfigFromEnv(env);
    if (!config) return null;

    const account = await env.DB.prepare(
        `SELECT account_id AS accountId
         FROM account
         WHERE user_id = ? AND provider_id = 'discord'
         LIMIT 1`,
    )
        .bind(userId)
        .first<{ accountId: string }>();

    if (!account) return null;

    const discordId = account.accountId;
    const cacheKey = `discord:member:${discordId}`;
    const cached = await env.KV.get<CachedDiscordMember>(
        cacheKey,
        "json",
    ).catch(() => null);
    const roles = cached
        ? cached.roles
        : await fetchMemberRoles(config, discordId);
    if (!cached) {
        await env.KV.put(cacheKey, JSON.stringify({ roles }), {
            expirationTtl: DISCORD_MEMBERSHIP_CACHE_TTL_SECONDS,
        }).catch(() => undefined);
    }
    return roles ? { discordId, roles } : null;
}

/** The member's role ids, or null when they are not in the server. */
async function fetchMemberRoles(
    config: DiscordConfig,
    discordId: string,
): Promise<string[] | null> {
    const response = await fetch(
        `https://discord.com/api/v10/guilds/${POLLINATIONS_DISCORD_GUILD_ID}/members/${discordId}`,
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
        return null;
    }
    if (!response.ok) {
        throw new Error(`Discord membership check failed: ${response.status}`);
    }

    const member = (await response.json()) as { roles: string[] };
    return member.roles;
}
