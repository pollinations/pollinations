import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PROMPT = `This is a placeholder for the ChickyTutor system prompt. The actual prompt is stored in secretPrompts/chickytutor.txt and is not publicly visible for proprietary reasons.`;

function loadChickyTutorPrompt(): string {
    const promptPath = path.join(
        __dirname,
        "..",
        "secretPrompts",
        "chickytutor.txt",
    );

    if (!fs.existsSync(promptPath)) {
        console.log("ChickyTutor prompt file not found, using default prompt");
        return DEFAULT_PROMPT;
    }

    try {
        const content = fs.readFileSync(promptPath, "utf8");
        console.log(
            "ChickyTutor prompt loaded from secretPrompts/chickytutor.txt",
        );
        return content.trim();
    } catch (error) {
        console.error(
            "Error loading ChickyTutor prompt:",
            (error as Error).message,
        );
        return DEFAULT_PROMPT;
    }
}

export default loadChickyTutorPrompt();
