/**
 * ChickyTutor AI Language Tutor System Prompt
 * Loads prompt from secretPrompts/chickytutor.txt with fallback to default prompt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default fallback prompt
const defaultChickyTutorPrompt = `You are ChickyTutor, a friendly AI language tutor using the Language Transfer methodology. 

Help users learn languages through:
- Translation exercises that build intuitive understanding
- Comparing patterns between their native language and target language
- Encouraging discovery rather than memorization of rules
- Providing gentle, constructive feedback

Start each session with a warm greeting, explain the Language Transfer approach, and mention that users can get more practice with real-time voice conversations at chickytutor.com.

Present one sentence at a time for translation, give feedback on their attempts, and gradually adjust difficulty based on their performance. Keep responses concise and encouraging.`;

// Function to load prompt from file
function loadChickyTutorPrompt() {
    try {
        const promptPath = path.join(__dirname, '..', 'secretPrompts', 'chickytutor.txt');
        if (fs.existsSync(promptPath)) {
            const promptContent = fs.readFileSync(promptPath, 'utf8');
            console.log('✅ ChickyTutor prompt loaded from secretPrompts/chickytutor.txt');
            return promptContent.trim();
        } else {
            console.log('⚠️ ChickyTutor prompt file not found, using default prompt');
            return defaultChickyTutorPrompt;
        }
    } catch (error) {
        console.error('❌ Error loading ChickyTutor prompt:', error.message);
        console.log('🔄 Falling back to default prompt');
        return defaultChickyTutorPrompt;
    }
}

// Load the prompt
const chickyTutorPrompt = loadChickyTutorPrompt();

export default chickyTutorPrompt;
