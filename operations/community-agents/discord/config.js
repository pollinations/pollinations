function required(env, name) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

export function loadConfig(env = process.env) {
    const agentId = required(env, "COMMUNITY_AGENT_ID");
    return {
        agentId,
        agentName:
            env.COMMUNITY_AGENT_NAME?.trim() || agentId.split("/").at(-1),
        appKey: required(env, "POLLINATIONS_APP_KEY"),
        discordClientId: required(env, "DISCORD_CLIENT_ID"),
        discordGuildId: env.DISCORD_GUILD_ID?.trim(),
        discordToken: required(env, "DISCORD_TOKEN"),
    };
}
