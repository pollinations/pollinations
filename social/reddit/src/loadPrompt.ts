import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPTS_DIR = join(__dirname, '../../prompts/reddit');

export function loadPrompt(name: string): string {
    const filePath = join(PROMPTS_DIR, `${name}.md`);
    return readFileSync(filePath, 'utf-8');
}
