const POLLINATIONS_DISCORD_GUILD_ID = "885844321461485618";

type DiscordBindings = CloudflareBindings & {
    DISCORD_BOT_TOKEN: string;
};

export type DiscordMembership = {
    member: boolean;
    joinedAt: string | null;
};

export async function getPollinationsDiscordMembership(
    env: CloudflareBindings,
    userId: string,
): Promise<DiscordMembership | null> {
    const account = await env.DB.prepare(
        `SELECT account_id AS accountId
         FROM account
         WHERE user_id = ? AND provider_id = 'discord'
         LIMIT 1`,
    )
        .bind(userId)
        .first<{ accountId: string }>();

    if (!account) return null;

    const response = await fetch(
        `https://discord.com/api/v10/guilds/${POLLINATIONS_DISCORD_GUILD_ID}/members/${account.accountId}`,
        {
            headers: {
                Authorization: `Bot ${(env as DiscordBindings).DISCORD_BOT_TOKEN}`,
            },
        },
    );

    if (response.status === 404) return { member: false, joinedAt: null };
    if (!response.ok) {
        throw new Error(`Discord membership check failed: ${response.status}`);
    }

    const member = (await response.json()) as { joined_at?: string };
    return { member: true, joinedAt: member.joined_at ?? null };
}
