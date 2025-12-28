/**
 * ChickyTutor AI Language Tutor System Prompt
 * Loads prompt from secretPrompts/chickytutor.txt with fallback to default prompt
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default fallback prompt - placeholder only
const defaultChickyTutorPrompt = `This is a placeholder for the ChickyTutor system prompt. The actual prompt is stored in secretPrompts/chickytutor.txt and is not publicly visible for proprietary reasons.`;

// Function to load prompt from file
function loadChickyTutorPrompt() {
    try {
        const promptPath = path.join(
            __dirname,
            "..",
            "secretPrompts",
            "chickytutor.txt",
        );
        if (fs.existsSync(promptPath)) {
            const promptContent = fs.readFileSync(promptPath, "utf8");
            console.log(
                "✅ ChickyTutor prompt loaded from secretPrompts/chickytutor.txt",
            );
            return promptContent.trim();
        } else {
            console.log(
                "⚠️ ChickyTutor prompt file not found, using default prompt",
            );
            return defaultChickyTutorPrompt;
        }
    } catch (error) {
        console.error("❌ Error loading ChickyTutor prompt:", error.message);
        console.log("🔄 Falling back to default prompt");
        return defaultChickyTutorPrompt;
    }
}

// Load the prompt
const chickyTutorPrompt = loadChickyTutorPrompt();

export default chickyTutorPrompt;
