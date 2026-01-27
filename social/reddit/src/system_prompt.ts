import { loadPrompt } from './loadPrompt.js';

function getSystemPromptTemplate(pr_summary: string): string {
    const system_prompt = loadPrompt('system');
    return system_prompt.replace("{pr_summary}", pr_summary);
}

export { getSystemPromptTemplate };
