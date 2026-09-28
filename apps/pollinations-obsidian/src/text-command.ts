// text-command.ts — Generate text at cursor from prompt or selection

import { Notice } from "obsidian";
import type PolinationsPlugin from "../main";

export class PollinationsTextCommand {
    private plugin: PolinationsPlugin;

    constructor(plugin: PolinationsPlugin) {
        this.plugin = plugin;
    }

    /** Prompt user for input, then replace selection / insert at cursor */
    async run(): Promise<void> {
        const editor = this.plugin.getActiveEditor();
        if (!editor) {
            new Notice("No active editor found");
            return;
        }

        const selection = editor.getSelection().trim();
        const prompt =
            selection ||
            (await this.promptForText("Enter a prompt for text generation:"));
        if (!prompt) return;

        new Notice("Generating text… 🤖", 2000);

        try {
            const response = await this.plugin.client.generateText(
                prompt,
                this.plugin.settings.preferredTextModel,
                "",
                1024,
            );

            // Insert at cursor (or replace selection)
            const cursor = editor.getCursor();
            if (selection) {
                editor.replaceSelection(response);
            } else {
                editor.replaceRange(response, cursor);
            }

            new Notice("Text generated! ✅", 2000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Error: ${msg}`, 5000);
        }
    }

    /** Prompt the user for text input via a modal */
    private async promptForText(label: string): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            this.plugin.app.facade.openPrompt({
                title: label,
                placeholder: "Enter your prompt...",
                input: {
                    sign: false,
                    password: false,
                },
                submit: (value: string) => resolve(value),
                cancel: () => resolve(null),
            });
        });
    }

    /** Initiate OAuth Device Flow for BYOP authentication */
    async authDeviceFlow(): Promise<void> {
        const clientId = this.plugin.settings.apiKey;
        if (!clientId.startsWith("pk_")) {
            new Notice(
                "A publishable key (pk_...) is required for device flow. Set it in settings.",
                5000,
            );
            return;
        }

        try {
            new Notice("Starting device flow…", 2000);
            const result = await this.plugin.client.startDeviceFlow(clientId);

            new Notice(
                `Visit: ${result.verification_uri}\nCode: ${result.user_code}`,
                10000,
            );

            // Poll for token
            const poll = async () => {
                const tokenResult = await this.plugin.client.pollDeviceToken(
                    result.device_code,
                    clientId,
                );

                if ("pending" in tokenResult) {
                    new Notice("Waiting for approval…", 3000);
                    setTimeout(poll, result.interval * 1000);
                } else {
                    this.plugin.settings.apiKey = tokenResult.access_token;
                    await this.plugin.saveSettings();
                    new Notice("Authenticated! ✅ Pollinations ready.", 3000);
                }
            };

            setTimeout(poll, result.interval * 1000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Device flow error: ${msg}`, 5000);
        }
    }
}
