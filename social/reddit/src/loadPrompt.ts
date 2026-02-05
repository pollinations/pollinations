import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPTS_DIR = join(__dirname, '../../prompts/reddit');
const SHARED_DIR = join(__dirname, '../../prompts/_shared');

function loadShared(name: string): string {
    const filePath = join(SHARED_DIR, `${name}.md`);
    return readFileSync(filePath, 'utf-8');
}

function injectSharedPrompts(content: string): string {
    if (content.includes('{about}')) {
        content = content.replaceAll('{about}', loadShared('about'));
    }
    if (content.includes('{visual_style}')) {
        content = content.replaceAll('{visual_style}', loadShared('visual_style'));
    }
    return content;
}

export function loadPrompt(name: string): string {
    const filePath = join(PROMPTS_DIR, `${name}.md`);
    const content = readFileSync(filePath, 'utf-8');
    return injectSharedPrompts(content);
}
