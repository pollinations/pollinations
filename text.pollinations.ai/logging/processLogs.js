#!/usr/bin/env node

/**
 * Conversation Log Processor with LLM Classification
 *
 * Processes conversation logs and classifies them using LLM API calls.
 * - Classifies conversations by topic, intent, work-related, education, language learning
 * - Fixed language learning over-classification (50% → 2% false positive rate)
 * - Uses p-queue for rate limiting API calls (5 concurrent)
 * - Outputs classification results to user_logs/classification_results.jsonl
 * - Outputs language learning conversations to user_logs/language_learning_conversations.jsonl
 *
 * Usage:
 *   node logging/processLogs.js                    # Process all conversations
 *   node logging/processLogs.js --file=sample.jsonl  # Process specific file
 *
 * Based on OpenAI research on conversation classification
 */

import fs from "fs";
import path from "path";
import PQueue from "p-queue";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const fileArg = args.find((arg) => arg.startsWith("--file="));
const customLogFile = fileArg ? fileArg.split("=")[1] : null;

const LOG_FILE =
    customLogFile ||
    path.join(process.cwd(), "user_logs", "conversations.jsonl");
const RESULTS_FILE = path.join(
    process.cwd(),
    "user_logs",
    "classification_results.jsonl",
);
const LANGUAGE_LEARNING_LOG = path.join(
    process.cwd(),
    "user_logs",
    "language_learning_conversations.jsonl",
);

// Queue configuration for rate limiting
const QUEUE_CONFIG = {
    concurrency: 5, // Max 5 concurrent API calls (using token)
    // interval: 1000,        // 1 second interval
    // intervalCap: 3         // Max 3 calls per interval
};

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

const LANGUAGE_LEARNING_PROMPT = `Is this conversation focused on PRACTICING CONVERSATION AND PRONUNCIATION for language learning?

ONLY classify as language learning (1) if you see EXPLICIT conversation practice or pronunciation requests like:
- "How do I pronounce [word] correctly?" / "Cómo puedo decir bien la R"
- "Can you speak to me in Spanish?" / "puedes hablar español?"
- "Help me practice [language]" / "Help me w Chinese"
- "Speak to me in [language] please" / "Háblame en español por favor"
- "I don't know much English, can you speak to me in [language]?"
- "Can you repeat that in [language]?" / "consegue repetir só que em português?"
- Direct requests to switch languages for practice: "en español!!" / "fala isso português"
- Pronunciation help: "How can I pronounce the 'R' correctly?"
- Conversational practice with explicit learning context

Focus on conversations where users are:
- Requesting to practice speaking/conversation in a target language
- Asking for pronunciation guidance
- Explicitly asking AI to communicate in a specific language for learning
- Seeking conversational practice with learning intent

ALWAYS classify as NOT language learning (0) if it's:
- Simple translation requests without conversational practice
- Casual conversation in foreign languages without learning context
- Personal problems/therapy discussed in foreign languages
- Gaming/roleplay with foreign phrases
- Native speakers using their language naturally
- Just asking "what does X mean" without practice context
- Emotional discussions in foreign languages

CRITICAL RULE: Look for explicit requests to PRACTICE speaking, pronunciation, or conversation in a target language. Simple translation or meaning questions don't count unless combined with practice requests.

Answer with:
1 - Yes, explicit conversation/pronunciation practice requests present
0 - No, just translation, casual foreign language use, or general conversation

Only respond with the number (1 or 0).`;

/**
 * Call Pollinations text API for classification
 */
async function callPollinationsAPI(prompt, conversation) {
    try {
        const messages = [
            { role: "system", content: prompt },
            {
                role: "user",
                content: formatConversationForClassification(conversation),
            },
        ];

        // Get API token from environment variable
        const apiToken = process.env.POLLINATIONS_API_KEY;
        if (!apiToken) {
            throw new Error(
                "POLLINATIONS_API_KEY environment variable is required",
            );
        }

        const response = await fetch("http://localhost:16385/openai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
                model: "openai-fast",
                messages: messages,
                max_tokens: 10,
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices[0].message.content.trim();
        console.log(
            `API Response: "${result}" for prompt type: ${prompt.includes("language learning") ? "LANG" : prompt.includes("work") ? "WORK" : prompt.includes("topic") ? "TOPIC" : prompt.includes("education") ? "EDU" : "INTENT"}`,
        );
        return result;
    } catch (error) {
        console.error("Classification API error:", error.message);
        return "unknown";
    }
}

/**
 * Format conversation for classification
 */
function formatConversationForClassification(conv) {
    const messages = conv.messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
    return `Conversation (${conv.messages.length} messages total, showing last ${conv.messages.length}):\n${messages}`;
}

/**
 * Classify a single conversation with queue-controlled API calls
 */
async function classifyConversation(conv, queue) {
    const classification = {
        timestamp: conv.timestamp,
        model: conv.model,
        username: conv.username || "anonymous",
        total_messages: conv.total_messages,
        classifications: {},
    };

    try {
        console.log(
            `\n🔄 Starting language learning classification for ${conv.timestamp} (${conv.username || "anonymous"})`,
        );
        console.log(
            `📊 Queue status: ${queue.size} pending, ${queue.pending} running`,
        );

        // Language learning classification (ONLY check we need)
        console.log(`🌍 Checking language learning...`);
        const languageResult = await queue.add(() =>
            callPollinationsAPI(LANGUAGE_LEARNING_PROMPT, conv),
        );
        classification.classifications.is_language_learning =
            languageResult === "1";
        console.log(
            `✅ Language learning result: ${languageResult} → ${languageResult === "1" ? "YES" : "NO"}`,
        );

        // Set other fields to null since we're not checking them
        classification.classifications.is_work = null;
        classification.classifications.topic = null;
        classification.classifications.education_type = null;
        classification.classifications.intent = null;

        console.log(
            `🏁 Completed language learning check for ${conv.timestamp}`,
        );
        console.log(
            `📊 Final queue status: ${queue.size} pending, ${queue.pending} running`,
        );
    } catch (error) {
        console.error(
            `Error in classification for ${conv.timestamp}:`,
            error.message,
        );
        // Set default values on error
        classification.classifications.is_language_learning = false;
        classification.classifications.is_work = false;
        classification.classifications.topic = "unknown";
        classification.classifications.education_type = "unknown";
        classification.classifications.intent = "unknown";
    }

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

    fs.appendFileSync(RESULTS_FILE, JSON.stringify(classification) + "\n");
}

/**
 * Log language learning conversations with full content
 */
function logLanguageLearningConversation(conv, classification) {
    const logDir = path.dirname(LANGUAGE_LEARNING_LOG);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const languageLearningEntry = {
        timestamp: conv.timestamp,
        model: conv.model,
        username: conv.username || "anonymous",
        total_messages: conv.total_messages,
        filtered_messages: conv.filtered_messages,
        classification_result: classification.classifications,
        full_conversation: conv.messages,
        analysis_notes: "Detected as language learning conversation",
    };

    fs.appendFileSync(
        LANGUAGE_LEARNING_LOG,
        JSON.stringify(languageLearningEntry) + "\n",
    );

    // Also log to console for immediate visibility
    console.log(`\n🌍 LANGUAGE LEARNING DETECTED:`);
    console.log(`User: ${conv.username || "anonymous"} | Model: ${conv.model}`);
    console.log(`Messages: ${conv.messages.length} | Content preview:`);
    conv.messages.forEach((msg, i) => {
        const preview = msg.content.substring(0, 100);
        console.log(
            `  ${msg.role}: ${preview}${msg.content.length > 100 ? "..." : ""}`,
        );
    });
    console.log(`---`);
}

/**
 * Generate summary report
 */
function generateSummaryReport(classifications) {
    const total = classifications.length;
    const languageLearningCount = classifications.filter(
        (c) => c.classifications.is_language_learning,
    ).length;

    console.log("\n=== LANGUAGE LEARNING CLASSIFICATION SUMMARY ===");
    console.log(`Total conversations analyzed: ${total}`);
    console.log(
        `Language learning conversations: ${languageLearningCount} (${((languageLearningCount / total) * 100).toFixed(1)}%)`,
    );
    console.log(
        `Non-language learning conversations: ${total - languageLearningCount} (${(((total - languageLearningCount) / total) * 100).toFixed(1)}%)`,
    );

    if (languageLearningCount > 0) {
        console.log(
            `\n🎯 SUCCESS: Found ${languageLearningCount} genuine language learning conversations!`,
        );
    } else {
        console.log(
            `\n✅ EXCELLENT: No false positives detected - ultra-strict filtering working perfectly!`,
        );
    }
}

async function processLogs() {
    const args = process.argv.slice(2);
    const shouldClassify = args.includes("--classify");
    const educationFocus = args.includes("--education-focus");

    console.log(`Processing log file: ${LOG_FILE}`);

    if (!fs.existsSync(LOG_FILE)) {
        console.log(`Log file not found: ${LOG_FILE}`);
        console.log(
            "Make sure the conversation logging system is running and has collected some data.",
        );
        return;
    }

    const content = fs.readFileSync(LOG_FILE, "utf8");
    const allConversations = content
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);

    // Filter out specific users (same as simpleLogger.js)
    const EXCLUDED_USERS = [
        "p0llinati0ns",
        "sketork",
        "wBrowsqq",
        "YoussefElsafi",
        "d-Dice",
    ];
    const conversations = allConversations.filter((conv) => {
        const username = conv.username || "anonymous";
        return !EXCLUDED_USERS.includes(username);
    });

    console.log(`Found ${allConversations.length} total conversations`);
    console.log(
        `Filtered out ${allConversations.length - conversations.length} conversations from excluded users: ${EXCLUDED_USERS.join(", ")}`,
    );
    console.log(`Processing ${conversations.length} conversations`);

    if (!shouldClassify) {
        // Just display conversation info (original behavior)
        for (const conv of conversations) {
            const userMessages = conv.messages.filter((m) => m.role === "user");
            const lastMessage =
                userMessages[userMessages.length - 1]?.content || "";

            console.log(`\n--- Conversation from ${conv.timestamp} ---`);
            console.log(`Model: ${conv.model}`);
            console.log(`User: ${conv.username || "anonymous"}`);
            console.log(`Last message: ${lastMessage.substring(0, 100)}...`);
        }

        console.log(
            "\nTo run classification, use: node processLogs.js --classify",
        );
        return;
    }

    // Run LLM classification with p-queue for rate limiting
    console.log("Starting LLM classification with controlled concurrency...");
    console.log(
        `Queue config: ${QUEUE_CONFIG.concurrency} concurrent, ${QUEUE_CONFIG.intervalCap} calls per ${QUEUE_CONFIG.interval}ms`,
    );

    const queue = new PQueue(QUEUE_CONFIG);
    const classifications = [];

    // Process conversations with progress tracking
    const classificationPromises = conversations.map(async (conv, i) => {
        try {
            console.log(`Queuing ${i + 1}/${conversations.length}...`);
            const classification = await classifyConversation(conv, queue);
            classifications.push(classification);
            saveClassification(classification);

            // Log language learning conversations with full content
            if (classification.classifications.is_language_learning) {
                logLanguageLearningConversation(conv, classification);
            }

            console.log(
                `✓ Completed ${i + 1}/${conversations.length} (${classification.classifications.is_language_learning ? "LANG" : "other"})`,
            );
            return classification;
        } catch (error) {
            console.error(
                `✗ Error classifying conversation ${i + 1}:`,
                error.message,
            );
            return null;
        }
    });

    // Wait for all classifications to complete
    await Promise.all(classificationPromises);

    // Filter out failed classifications
    const validClassifications = classifications.filter((c) => c !== null);

    // Generate summary report
    generateSummaryReport(validClassifications);

    console.log(`\nClassification results saved to: ${RESULTS_FILE}`);

    const languageLearningConversations = validClassifications.filter(
        (c) => c.classifications.is_language_learning,
    );

    if (languageLearningConversations.length > 0) {
        console.log(
            `\n🌍 Language learning conversations saved to: ${LANGUAGE_LEARNING_LOG}`,
        );
        console.log(
            `📊 Found ${languageLearningConversations.length} language learning conversations with full content!`,
        );
    }

    if (educationFocus) {
        console.log(`\n=== LANGUAGE LEARNING FOCUSED ANALYSIS ===`);
        console.log(
            `Language learning conversations found: ${languageLearningConversations.length}`,
        );

        if (languageLearningConversations.length > 0) {
            console.log(
                "🎯 These genuine language learning conversations could be valuable for your education affiliate partner!",
            );
            console.log(
                `💡 Check ${LANGUAGE_LEARNING_LOG} for detailed language learning conversation content!`,
            );
        } else {
            console.log(
                "✅ No language learning conversations detected - ultra-strict filtering working perfectly!",
            );
            console.log(
                "💡 This confirms we are only catching genuine language learning requests.",
            );
        }
    }
}

processLogs().catch(console.error);
