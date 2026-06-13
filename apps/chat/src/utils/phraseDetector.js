/**
 * Phrase detection and conversation integrity verification.
 *
 * Detects when an outgoing user message claims the AI said something specific,
 * then checks whether that claim is supported by actual conversation history.
 *
 * This is not an accusation system — it surfaces an informational note when a
 * user's reference to a prior AI statement cannot be verified against the
 * recorded history. Legitimate corrections and references will typically match.
 *
 * All functions are try/catch guarded and will never throw to callers.
 *
 * Authored by stormdede515-eng
 * https://github.com/stormdede515-eng
 */

// Ordered most-specific first so the longest matching phrase wins.
const REFERENCE_PHRASES = [
    "you explicitly told me",
    "you explicitly said",
    "you already told me",
    "you already said",
    "you literally said",
    "you just told me",
    "you just said",
    "you told me to",
    "you told me",
    "you said it was",
    "you said that",
    "you said to",
    "you said",
    "you recommended that",
    "you recommended",
    "you suggested that",
    "you suggested",
    "you confirmed that",
    "you confirmed",
    "you approved",
    "you agreed that",
    "you agreed",
    "you promised",
    "earlier you said",
    "you mentioned that",
    "you mentioned",
];

// Words too common to be meaningful keywords for history matching.
const STOP_WORDS = new Set([
    "that", "this", "with", "from", "have", "were", "they", "their",
    "what", "when", "where", "which", "would", "could", "should", "will",
    "your", "about", "there", "these", "those", "just", "also", "been",
    "into", "some", "more", "very", "then", "than", "only", "even",
    "well", "back", "much", "such", "both", "good", "need", "like",
]);

/**
 * Extract meaningful keywords from a text fragment.
 * Filters stop words and very short tokens.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
    try {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    } catch {
        return [];
    }
}

/**
 * Scan a user message for reference phrases.
 * Returns the first match found (most specific phrase wins).
 *
 * @param {string} text — the outgoing user message
 * @returns {{ found: boolean, phrase: string|null, claimText: string|null }}
 */
export function detectReference(text) {
    try {
        if (!text || typeof text !== "string") return { found: false, phrase: null, claimText: null };
        const lower = text.toLowerCase();
        for (const phrase of REFERENCE_PHRASES) {
            const idx = lower.indexOf(phrase);
            if (idx !== -1) {
                const claimText = text.slice(idx + phrase.length).trim();
                return { found: true, phrase, claimText };
            }
        }
        return { found: false, phrase: null, claimText: null };
    } catch {
        return { found: false, phrase: null, claimText: null };
    }
}

/**
 * Verify whether a claimed reference is supported by conversation history.
 * Searches all prior assistant messages for the keywords extracted from the claim.
 *
 * @param {string} claimText — the text after the reference phrase
 * @param {Array<{role: string, content: string}>} conversationHistory
 * @returns {{
 *   supported: boolean|null,  // null = could not determine (too few keywords)
 *   matchCount: number,
 *   totalKeywords: number,
 *   keywords: string[]
 * }}
 */
export function verifyAgainstHistory(claimText, conversationHistory) {
    try {
        const keywords = extractKeywords(claimText || "");
        if (keywords.length === 0) {
            return { supported: null, matchCount: 0, totalKeywords: 0, keywords: [] };
        }

        const allAssistantText = (conversationHistory || [])
            .filter((m) => m.role === "assistant")
            .map((m) => (typeof m.content === "string" ? m.content : "").toLowerCase())
            .join(" ");

        if (!allAssistantText.trim()) {
            return { supported: null, matchCount: 0, totalKeywords: keywords.length, keywords };
        }

        const matchCount = keywords.filter((k) => allAssistantText.includes(k)).length;
        const matchRatio = matchCount / keywords.length;

        // Require >50% keyword coverage to consider the reference supported.
        return {
            supported: matchRatio > 0.5,
            matchCount,
            totalKeywords: keywords.length,
            keywords,
        };
    } catch {
        return { supported: null, matchCount: 0, totalKeywords: 0, keywords: [] };
    }
}
