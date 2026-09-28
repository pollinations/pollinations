// main.ts — Pollinations AI plugin entry point
//
// Registers Obsidian commands:
//   - Pollinations: Generate text at cursor
//   - Pollinations: Generate image from selection → save to vault + embed
//   - Pollinations: Pick model
//   - Pollinations: Open device flow auth

import { type Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { PollinationsImageCommand } from "./src/image-command";
import { ModelPicker } from "./src/model-picker";
import { PollinationsClient } from "./src/pollinations-client";
import { PollinationsSettingTab } from "./src/settings";
import { PollinationsTextCommand } from "./src/text-command";

interface PollinationsSettings {
    apiKey: string;
    preferredTextModel: string;
    preferredImageModel: string;
    preferredVoice: string;
}

const DEFAULT_SETTINGS: PollinationsSettings = {
    apiKey: "",
    preferredTextModel: "openai/gpt-5.4-nano",
    preferredImageModel: "gptimage",
    preferredVoice: "nova",
};

export default class PollinationsPlugin extends Plugin {
    settings!: PollinationsSettings;
    client!: PollinationsClient;
    textCommand!: PollinationsTextCommand;
    imageCommand!: PollinationsImageCommand;
    modelPicker!: ModelPicker;

    async onload() {
        await this.loadSettings();
        this.client = new PollinationsClient(this.settings.apiKey);

        this.textCommand = new PollinationsTextCommand(this);
        this.imageCommand = new PollinationsImageCommand(this);
        this.modelPicker = new ModelPicker(this);

        // Register text generation command
        this.addCommand({
            id: "pollinations-generate-text",
            name: "Generate text at cursor",
            editorAction: (_editor: Editor) => "Pollinations",
            callback: () => this.textCommand.run(),
        });

        // Register image generation command
        this.addCommand({
            id: "pollinations-generate-image",
            name: "Generate image from selection",
            editorAction: (_editor: Editor) => "Pollinations",
            callback: () => this.imageCommand.run(),
        });

        // Register model picker command
        this.addCommand({
            id: "pollinations-pick-model",
            name: "Pick Pollinations model",
            callback: () => this.modelPicker.run(),
        });

        // Register BYOP device flow command
        this.addCommand({
            id: "pollinations-auth-device-flow",
            name: "Authenticate with device flow",
            callback: () => this.textCommand.authDeviceFlow(),
        });

        // Settings tab
        this.addSettingTab(new PollinationsSettingTab(this.app, this));

        new Notice("Pollinations plugin loaded 👋", 3000);
    }

    onunload() {
        new Notice("Pollinations plugin unloaded", 2000);
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.client) {
            this.client.apiKey = this.settings.apiKey;
        }
    }

    /** Get the current editor instance from the active markdown view */
    getActiveEditor(): Editor | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return null;
        return view.editor;
    }

    /** Get selected text or prompt the user for input */
    getPromptOrSelection(): string | null {
        const editor = this.getActiveEditor();
        if (!editor) return null;

        const selection = editor.getSelection();
        if (selection?.trim()) {
            return selection.trim();
        }
        return null;
    }
}
