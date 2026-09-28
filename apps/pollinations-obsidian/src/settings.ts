// settings.ts — Obsidian settings tab for Pollinations plugin

import { App, PluginSettingTab, Setting } from 'obsidian';
import PolinationsPlugin from '../main';

export class PollinationsSettingTab extends PluginSettingTab {
	plugin: PollinationsPlugin;

	constructor(app: App, plugin: PolinationsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Pollinations AI Settings' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your Pollinations API key (sk_...) or publishable key (pk_...) for device flow. Get one at https://enter.pollinations.ai/keys')
			.addText((tc) =>
				tc
					.setPlaceholder('sk_...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (val) => {
						this.plugin.settings.apiKey = val;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl('h3', { text: 'Default Models' });

		new Setting(containerEl)
			.setName('Preferred Text Model')
			.setDesc('Default model for text generation')
			.addText((tc) =>
				tc
					.setPlaceholder('openai/gpt-5.4-nano')
					.setValue(this.plugin.settings.preferredTextModel)
					.onChange(async (val) => {
						this.plugin.settings.preferredTextModel = val;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Preferred Image Model')
			.setDesc('Default model for image generation')
			.addText((tc) =>
				tc
					.setPlaceholder('gptimage')
					.setValue(this.plugin.settings.preferredImageModel)
					.onChange(async (val) => {
						this.plugin.settings.preferredImageModel = val;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl('p', {
			cls: 'setting-description',
			text: '💡 Use "Pollinations: Pick model" command to browse live model lists. Use "Pollinations: Authenticate with device flow" for BYOP (Bring Your Own Pollen).',
		});
	}
}
