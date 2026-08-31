import {
    ChannelType,
    Client,
    GatewayIntentBits,
    type Message,
    MessageFlags,
    type TextChannel,
    type ThreadChannel,
} from "discord.js";
import { formatTranscript } from "./content.js";
import type { ChatMessage } from "./types.js";

export interface HumanReply {
    content: string;
    discordId: string;
}

export interface HumanGateway {
    createThread(name: string): Promise<string>;
    ask(
        threadId: string,
        messages: ChatMessage[],
        timeoutMs: number,
    ): Promise<HumanReply>;
}

interface DiscordGatewayOptions {
    token: string;
    guildId: string;
    channelId: string;
    responderRoleId: string;
}

export class DiscordGateway implements HumanGateway {
    readonly #client: Client;
    readonly #options: DiscordGatewayOptions;
    #channel?: TextChannel;

    constructor(options: DiscordGatewayOptions) {
        this.#options = options;
        this.#client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
    }

    async start(): Promise<void> {
        await this.#client.login(this.#options.token);
        const guild = await this.#client.guilds.fetch(this.#options.guildId);
        const channel = await guild.channels.fetch(this.#options.channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
            throw new Error(
                "DISCORD_CHANNEL_ID must identify a guild text channel",
            );
        }
        this.#channel = channel;
    }

    async createThread(name: string): Promise<string> {
        if (!this.#channel) throw new Error("Discord gateway has not started");
        const thread = await this.#channel.threads.create({
            name: name.slice(0, 100),
            type: ChannelType.PublicThread,
            autoArchiveDuration: 60,
            reason: "Human community model conversation",
        });
        return thread.id;
    }

    async ask(
        threadId: string,
        messages: ChatMessage[],
        timeoutMs: number,
    ): Promise<HumanReply> {
        const thread = await this.#getThread(threadId);
        let finalPromptId = "";
        for (const content of formatTranscript(messages)) {
            const prompt = await thread.send({
                content,
                allowedMentions: { parse: [] },
                flags: MessageFlags.SuppressEmbeds,
            });
            finalPromptId = prompt.id;
        }
        return this.#waitForReply(thread, finalPromptId, timeoutMs);
    }

    async #getThread(threadId: string): Promise<ThreadChannel> {
        if (!this.#channel) throw new Error("Discord gateway has not started");
        const thread = await this.#channel.threads.fetch(threadId);
        if (!thread || thread.type !== ChannelType.PublicThread) {
            throw new Error("Conversation thread is unavailable");
        }
        return thread;
    }

    #waitForReply(
        thread: ThreadChannel,
        finalPromptId: string,
        timeoutMs: number,
    ): Promise<HumanReply> {
        return new Promise((resolve, reject) => {
            let scanning = true;
            let draining = false;
            let settled = false;
            const pending: Message[] = [];

            const cleanup = () => {
                clearTimeout(timeout);
                this.#client.off("messageCreate", onMessage);
            };
            const accept = async (messages: Message[]) => {
                const ordered = messages
                    .filter(
                        (message) => BigInt(message.id) > BigInt(finalPromptId),
                    )
                    .sort((left, right) =>
                        BigInt(left.id) < BigInt(right.id) ? -1 : 1,
                    );
                for (const message of ordered) {
                    if (settled || !(await this.#eligible(message, thread)))
                        continue;
                    settled = true;
                    cleanup();
                    resolve({
                        content: message.content.trim(),
                        discordId: message.author.id,
                    });
                    return true;
                }
                return false;
            };
            const drain = async () => {
                if (scanning || draining || settled) return;
                draining = true;
                try {
                    while (pending.length > 0 && !settled) {
                        await accept(pending.splice(0));
                    }
                } finally {
                    draining = false;
                    if (pending.length > 0 && !settled) void drain();
                }
            };
            const onMessage = (message: Message) => {
                if (
                    message.channelId !== thread.id ||
                    BigInt(message.id) <= BigInt(finalPromptId)
                ) {
                    return;
                }
                pending.push(message);
                if (!scanning) void drain();
            };
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error("No eligible human response before timeout"));
            }, timeoutMs);

            this.#client.on("messageCreate", onMessage);
            void (async () => {
                try {
                    const fetched = await thread.messages.fetch({
                        after: finalPromptId,
                        limit: 100,
                    });
                    pending.push(...fetched.values());
                    scanning = false;
                    await drain();
                } catch (error) {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(error);
                }
            })();
        });
    }

    async #eligible(message: Message, thread: ThreadChannel): Promise<boolean> {
        if (
            message.channelId !== thread.id ||
            message.author.bot ||
            message.webhookId ||
            message.system ||
            message.content.trim().length === 0 ||
            message.attachments.size > 0 ||
            message.stickers.size > 0
        ) {
            return false;
        }
        try {
            const member =
                message.member ??
                (await thread.guild.members.fetch(message.author.id));
            return member.roles.cache.has(this.#options.responderRoleId);
        } catch {
            return false;
        }
    }
}
