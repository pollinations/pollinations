// model-picker.ts — Fetch and display available Pollinations model lists

import { Notice } from "obsidian";
import type PolinationsPlugin from "../main";
import type { ModelInfo } from "./pollinations-client";

export class ModelPicker {
    private plugin: PollinationsPlugin;

    constructor(plugin: PolinationsPlugin) {
        this.plugin = plugin;
    }

    /** Fetch model lists and display them in a notice/modal */
    async run(): Promise<void> {
        new Notice("Fetching models… 🤖", 2000);

        try {
            const [textModels, imageModels, audioModels] =
                await Promise.allSettled([
                    this.plugin.client.getModels("text"),
                    this.plugin.client.getModels("image"),
                    this.plugin.client.getModels("audio"),
                ]);

            let msg = "**Pollinations Models**\n\n";

            if (
                textModels.status === "fulfilled" &&
                textModels.value.length > 0
            ) {
                msg += `### Text (${textModels.value.length})\n`;
                textModels.value.slice(0, 10).forEach((m: ModelInfo) => {
                    const paid = m.paid_only ? " 🔒" : "";
                    msg += `- ${m.title || m.name} (${m.name})${paid}\n`;
                });
                msg += `\n`;
            }

            if (
                imageModels.status === "fulfilled" &&
                imageModels.value.length > 0
            ) {
                msg += `### Image (${imageModels.value.length})\n`;
                imageModels.value.slice(0, 10).forEach((m: ModelInfo) => {
                    const paid = m.paid_only ? " 🔒" : "";
                    msg += `- ${m.title || m.name} (${m.name})${paid}\n`;
                });
                msg += `\n`;
            }

            if (
                audioModels.status === "fulfilled" &&
                audioModels.value.length > 0
            ) {
                msg += `### Audio (${audioModels.value.length})\n`;
                audioModels.value.slice(0, 10).forEach((m: ModelInfo) => {
                    const paid = m.paid_only ? " 🔒" : "";
                    msg += `- ${m.title || m.name} (${m.name})${paid}\n`;
                });
            }

            // Insert model list into the active note
            const editor = this.plugin.getActiveEditor();
            if (editor) {
                const cursor = editor.getCursor();
                editor.replaceRange(msg, cursor);
                new Notice("Models inserted! ✅", 2000);
            } else {
                new Notice(msg, 10000);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Error fetching models: ${msg}`, 5000);
        }
    }
}
