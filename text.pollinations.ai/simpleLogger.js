import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "user_logs");
const LOG_FILE = path.join(LOG_DIR, "conversations.jsonl");

/**
 * Dead simple conversation logger
 * Just saves raw conversations to a single file
 */
export function logConversation(messages, model, username = null, maxMessages = 3) {
    // Simple 5% sampling
    if (Math.random() > 0.05) return;
    
    // Only keep the last N messages to reduce log size
    const recentMessages = messages.slice(-maxMessages);
    
    const entry = {
        timestamp: new Date().toISOString(),
        model,
        username,
        messages: recentMessages,
        total_messages: messages.length // Track original conversation length
    };
    
    // Ensure user_logs directory exists
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}
