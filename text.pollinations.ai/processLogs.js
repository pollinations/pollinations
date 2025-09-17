#!/usr/bin/env node

/**
 * Simple script to process conversation logs with an LLM
 * Usage: node processLogs.js
 */

import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "user_logs", "conversations.jsonl");

async function processLogs() {
    if (!fs.existsSync(LOG_FILE)) {
        console.log("No user_logs/conversations.jsonl file found");
        return;
    }
    
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const conversations = content.split('\n').filter(Boolean).map(JSON.parse);
    
    console.log(`Found ${conversations.length} conversations`);
    
    // Process each conversation
    for (const conv of conversations) {
        const userMessages = conv.messages.filter(m => m.role === 'user');
        const lastMessage = userMessages[userMessages.length - 1]?.content || "";
        
        console.log(`\n--- Conversation from ${conv.timestamp} ---`);
        console.log(`Model: ${conv.model}`);
        console.log(`User: ${conv.username || 'anonymous'}`);
        console.log(`Last message: ${lastMessage.substring(0, 100)}...`);
        
        // TODO: Send to LLM for classification
        // const classification = await classifyWithLLM(lastMessage);
        // console.log(`Classification: ${classification}`);
    }
}

processLogs().catch(console.error);
