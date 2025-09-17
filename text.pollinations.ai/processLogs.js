#!/usr/bin/env node

/**
 * Enhanced conversation log processor with LLM classification
 * Based on OpenAI research on conversation classification
 * Usage: node processLogs.js [--classify] [--education-focus]
 */

import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "user_logs", "conversations.jsonl");
const RESULTS_FILE = path.join(process.cwd(), "user_logs", "classification_results.jsonl");

// Classification prompts based on OpenAI research
const WORK_CLASSIFICATION_PROMPT = `You are an internal tool that classifies a message from a user to an AI chatbot, based on the context of the previous messages before it.

Does the last user message of this conversation transcript seem likely to be related to doing some work/employment?

Answer with one of the following:
(1) likely part of work (e.g. "rewrite this HR complaint")
(0) likely not part of work (e.g. "does ice reduce pimples?")

In your response, only give the number and no other text. IE: the only acceptable responses are 1 and 0.`;

const TOPIC_CLASSIFICATION_PROMPT = `Based on the conversation, classify the primary topic into one of these categories:

- practical_guidance: How-to advice, tutoring/teaching, creative ideation, health/fitness advice
- seeking_information: Specific factual information, current events, product info, recipes
- writing: Editing text, creating content, translation, summarization
- technical_help: Programming, math calculations, data analysis
- multimedia: Image creation/analysis, other media generation
- self_expression: Casual chat, relationships, games, role-play
- other: Doesn't fit other categories

Only respond with the category name (lowercase with underscores).`;

const EDUCATION_DETECTION_PROMPT = `Analyze this conversation for educational content. Is this likely:

1. Tutoring/Teaching - explaining concepts, helping with learning
2. Academic Writing - homework, essays, research assistance  
3. Skill Development - learning new skills or knowledge
4. Not Educational - other purposes

Respond with just the number (1, 2, 3, or 4).`;

const INTENT_CLASSIFICATION_PROMPT = `Classify the user's intent in the last message:

- asking: Seeking information or advice for decision-making
- doing: Requesting task completion or output generation
- expressing: No clear informational goal, just expressing

Respond with just the intent (asking/doing/expressing).`;

/**
 * Call Pollinations text API for classification
 */
async function callPollinationsAPI(prompt, conversation) {
    try {
        const messages = [
            { role: "system", content: prompt },
            { role: "user", content: formatConversationForClassification(conversation) }
        ];

        const response = await fetch('http://localhost:16385/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai-fast',
                messages: messages,
                max_tokens: 10,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Classification API error:', error.message);
        return 'unknown';
    }
}

/**
 * Format conversation for classification
 */
function formatConversationForClassification(conv) {
    const messages = conv.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return `Conversation (${conv.messages.length} messages total, showing last ${conv.messages.length}):\n${messages}`;
}

/**
 * Classify a single conversation
 */
async function classifyConversation(conv) {
    console.log(`\nClassifying conversation from ${conv.timestamp}...`);
    
    const classification = {
        timestamp: conv.timestamp,
        model: conv.model,
        username: conv.username || 'anonymous',
        total_messages: conv.total_messages,
        classifications: {}
    };

    // Work vs Non-work classification
    const workResult = await callPollinationsAPI(WORK_CLASSIFICATION_PROMPT, conv);
    classification.classifications.is_work = workResult === '1';

    // Topic classification
    const topicResult = await callPollinationsAPI(TOPIC_CLASSIFICATION_PROMPT, conv);
    classification.classifications.topic = topicResult;

    // Education detection
    const educationResult = await callPollinationsAPI(EDUCATION_DETECTION_PROMPT, conv);
    classification.classifications.education_type = {
        '1': 'tutoring_teaching',
        '2': 'academic_writing', 
        '3': 'skill_development',
        '4': 'not_educational'
    }[educationResult] || 'unknown';

    // Intent classification
    const intentResult = await callPollinationsAPI(INTENT_CLASSIFICATION_PROMPT, conv);
    classification.classifications.intent = intentResult;

    return classification;
}

/**
 * Save classification results
 */
function saveClassification(classification) {
    const logDir = path.dirname(RESULTS_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(RESULTS_FILE, JSON.stringify(classification) + '\n');
}

/**
 * Generate summary report
 */
function generateSummaryReport(classifications) {
    const total = classifications.length;
    const workCount = classifications.filter(c => c.classifications.is_work).length;
    const educationCount = classifications.filter(c => 
        c.classifications.education_type !== 'not_educational' && 
        c.classifications.education_type !== 'unknown'
    ).length;

    // Topic distribution
    const topics = {};
    classifications.forEach(c => {
        const topic = c.classifications.topic;
        topics[topic] = (topics[topic] || 0) + 1;
    });

    // Education breakdown
    const educationTypes = {};
    classifications.forEach(c => {
        const eduType = c.classifications.education_type;
        educationTypes[eduType] = (educationTypes[eduType] || 0) + 1;
    });

    console.log('\n=== CONVERSATION CLASSIFICATION SUMMARY ===');
    console.log(`Total conversations analyzed: ${total}`);
    console.log(`Work-related: ${workCount} (${(workCount/total*100).toFixed(1)}%)`);
    console.log(`Education-related: ${educationCount} (${(educationCount/total*100).toFixed(1)}%)`);
    
    console.log('\n--- Topic Distribution ---');
    Object.entries(topics).sort((a,b) => b[1] - a[1]).forEach(([topic, count]) => {
        console.log(`${topic}: ${count} (${(count/total*100).toFixed(1)}%)`);
    });

    console.log('\n--- Education Type Breakdown ---');
    Object.entries(educationTypes).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`${type}: ${count} (${(count/total*100).toFixed(1)}%)`);
    });
}

async function processLogs() {
    const args = process.argv.slice(2);
    const shouldClassify = args.includes('--classify');
    const educationFocus = args.includes('--education-focus');

    if (!fs.existsSync(LOG_FILE)) {
        console.log("No user_logs/conversations.jsonl file found");
        console.log("Make sure the conversation logging system is running and has collected some data.");
        return;
    }
    
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const conversations = content.split('\n').filter(Boolean).map(JSON.parse);
    
    console.log(`Found ${conversations.length} conversations`);

    if (!shouldClassify) {
        // Just display conversation info (original behavior)
        for (const conv of conversations) {
            const userMessages = conv.messages.filter(m => m.role === 'user');
            const lastMessage = userMessages[userMessages.length - 1]?.content || "";
            
            console.log(`\n--- Conversation from ${conv.timestamp} ---`);
            console.log(`Model: ${conv.model}`);
            console.log(`User: ${conv.username || 'anonymous'}`);
            console.log(`Last message: ${lastMessage.substring(0, 100)}...`);
        }
        
        console.log('\nTo run classification, use: node processLogs.js --classify');
        return;
    }

    // Run LLM classification
    console.log('Starting LLM classification...');
    const classifications = [];
    
    for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        console.log(`Processing ${i + 1}/${conversations.length}...`);
        
        try {
            const classification = await classifyConversation(conv);
            classifications.push(classification);
            saveClassification(classification);
            
            // Brief delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Error classifying conversation ${i + 1}:`, error.message);
        }
    }

    // Generate summary report
    generateSummaryReport(classifications);
    
    console.log(`\nClassification results saved to: ${RESULTS_FILE}`);
    
    if (educationFocus) {
        const educationalConversations = classifications.filter(c => 
            c.classifications.education_type !== 'not_educational' && 
            c.classifications.education_type !== 'unknown'
        );
        
        console.log(`\n=== EDUCATION-FOCUSED ANALYSIS ===`);
        console.log(`Found ${educationalConversations.length} educational conversations`);
        console.log('These could be valuable for your education affiliate partner!');
    }
}

processLogs().catch(console.error);
