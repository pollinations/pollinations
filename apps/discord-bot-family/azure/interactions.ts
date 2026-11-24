import { createServer } from "node:http";

type Command = {
    id: string;
    application_id: string;
    token: string;
    data?: { name?: string; options?: { name: string; value: unknown }[] };
    member?: { user?: DiscordUser };
    user?: DiscordUser;
};

type DiscordUser = { id: string; avatar?: string | null };

export function serveInteractions(
    port: number,
    command: string,
    filename: string,
    generate: (prompt: string, avatarUrl: string | null) => Promise<Buffer>,
    publish: (image: Buffer) => Promise<void>,
) {
    const processed = new Set<string>();
    const server = createServer(async (req, res) => {
        if (req.method !== "POST" || req.url !== "/") {
            res.writeHead(404).end();
            return;
        }
        let interaction: Command;
        try {
            const chunks: Buffer[] = [];
            let received = 0;
            for await (const chunk of req) {
                received += chunk.length;
                if (received > 64 * 1024) {
                    res.writeHead(413).end();
                    return;
                }
                chunks.push(chunk);
            }
            interaction = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            res.writeHead(400).end();
            return;
        }
        const prompt = interaction?.data?.options?.find(
            (option) => option.name === "prompt",
        )?.value;
        if (
            interaction?.data?.name !== command ||
            typeof prompt !== "string" ||
            !prompt.trim() ||
            prompt.length > 1000 ||
            !/^\d{16,22}$/.test(interaction.id) ||
            !/^\d{16,22}$/.test(interaction.application_id) ||
            !/^[a-zA-Z0-9_.-]{1,512}$/.test(interaction.token)
        ) {
            res.writeHead(400).end();
            return;
        }
        res.writeHead(202).end();
        if (processed.has(interaction.id)) return;
        processed.add(interaction.id);
        setTimeout(() => processed.delete(interaction.id), 15 * 60_000).unref();
        const author = interaction.member?.user ?? interaction.user;
        const avatarUrl =
            author &&
            /^\d{16,22}$/.test(author.id) &&
            /^[\da-f_]{32,34}$/.test(author.avatar ?? "")
                ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=1024`
                : null;
        const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
        try {
            const image = await generate(prompt.trim(), avatarUrl);
            const form = new FormData();
            form.append(
                "files[0]",
                new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
                filename,
            );
            const reply = await fetch(url, {
                method: "PATCH",
                body: form,
                redirect: "error",
                signal: AbortSignal.timeout(15000),
            });
            await reply.body?.cancel();
            if (!reply.ok) throw new Error("Discord reply failed");
            await publish(image);
        } catch {
            const reply = await fetch(url, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    content: "Generation failed. Please try again.",
                }),
                redirect: "error",
                signal: AbortSignal.timeout(5000),
            }).catch(() => null);
            await reply?.body?.cancel().catch(() => {});
            console.error(`Discord command ${command} failed`);
        }
    });
    server.listen(port, "0.0.0.0");
}
