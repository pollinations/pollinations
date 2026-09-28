// image-command.ts — Generate image from prompt/selection, save to vault, embed in note

import { Notice } from "obsidian";
import type PolinationsPlugin from "../main";

export class PollinationsImageCommand {
    private plugin: PollinationsPlugin;

    constructor(plugin: PolinationsPlugin) {
        this.plugin = plugin;
    }

    /** Generate an image from selection or prompt, save to vault, embed at cursor */
    async run(): Promise<void> {
        const editor = this.plugin.getActiveEditor();
        if (!editor) {
            new Notice("No active editor found");
            return;
        }

        const selection = editor.getSelection().trim();
        const prompt =
            selection ||
            (await this.promptForText("Enter a prompt for image generation:"));
        if (!prompt) return;

        new Notice("Generating image… 🖼️", 2000);

        try {
            const blobUrl = await this.plugin.client.generateImage(
                prompt,
                this.plugin.settings.preferredImageModel,
                512,
                512,
                true,
            );

            // Fetch the blob and save to vault
            const resp = await fetch(blobUrl);
            const blob = await resp.blob();

            // Generate a safe filename
            const safeName = prompt
                .replace(/[^a-zA-Z0-9]/g, "_")
                .substring(0, 50);
            const fileName = `pollinations_${safeName}_${Date.now()}.png`;

            // Save to vault in the same directory as the current file (or root)
            const file = this.plugin.app.workspace.getActiveFile();
            const dir = file ? file.parent : this.plugin.app.vault.getRoot();
            const filePath = dir ? `${dir.path}/${fileName}` : fileName;

            const arrayBuffer = await blob.arrayBuffer();
            await this.plugin.app.vault.createBinary(
                filePath,
                arrayBuffer as ArrayBuffer,
            );

            // Embed in note using wiki-link
            const embed = `![[${fileName}]]`;

            const cursor = editor.getCursor();
            if (selection) {
                editor.replaceSelection(embed);
            } else {
                editor.replaceRange(embed, cursor);
            }

            // Revoke the blob URL to prevent memory leak
            URL.revokeObjectURL(blobUrl);

            new Notice(`Image saved! ✅`, 2000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Error: ${msg}`, 5000);
        }
    }

    /** Prompt the user for text input */
    private async promptForText(label: string): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            this.plugin.app.facade.openPrompt({
                title: label,
                placeholder: "Enter your image prompt...",
                input: {
                    sign: false,
                    password: false,
                },
                submit: (value: string) => resolve(value),
                cancel: () => resolve(null),
            });
        });
    }
}
