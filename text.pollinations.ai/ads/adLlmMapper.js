import { affiliatesData } from "./affiliate_prompt.js";
import { generateTextPortkey } from "../generateTextPortkey.js";
import debug from "debug";

// Base URL for affiliate redirects
export const REDIRECT_BASE_URL = "https://pollinations.ai/redirect/";

const log = debug("pollinations:adfilter");
const errorLog = debug("pollinations:adfilter:error");

/**
 * Find the most relevant affiliate for the given content using an LLM.
 *
 * @param {string} content - The output content to analyze.
 * @param {Array} messages - The input messages to analyze (optional).
 * @param {string} userCountry - The user's country code (optional).
 * @returns {Promise<object|null>} - The affiliate object, or null if none found/suitable.
 */
export async function findRelevantAffiliate(
    content,
    messages = [],
    userCountry = null,
) {
    // Combine the last 3 messages with the current content for context
    const lastMessages = messages
        .slice(-3)
        .map((m) => m.content || "")
        .filter(Boolean);
    const combinedContent = [...lastMessages, content].join("\n");

    if (!combinedContent || combinedContent.trim() === "") {
        log("No content to analyze for affiliate matching");
        return null;
    }

    // Check if we should exclude NSFW content
    const shouldExcludeNSFW =
        !combinedContent.toLowerCase().includes("nsfw") &&
        !combinedContent.toLowerCase().includes("adult") &&
        !combinedContent.toLowerCase().includes("sex");

    // Filter out NSFW affiliates if needed
    let eligibleAffiliates = shouldExcludeNSFW
        ? affiliatesData.filter((affiliate) => !affiliate.nsfw)
        : affiliatesData;

    // Filter out affiliates that are blocked in the user's country
    if (userCountry) {
        log(`Filtering affiliates for user country: ${userCountry}`);
        eligibleAffiliates = eligibleAffiliates.filter((affiliate) => {
            // Skip if affiliate doesn't have blockedCountries property
            if (
                !affiliate.blockedCountries ||
                !Array.isArray(affiliate.blockedCountries)
            ) {
                return true;
            }

            // Check if the user's country is in the blockedCountries list
            const isBlocked = affiliate.blockedCountries.includes(userCountry);
            if (isBlocked) {
                log(
                    `Affiliate ${affiliate.id} (${affiliate.name}) is blocked in ${userCountry}`,
                );
            }
            return !isBlocked;
        });

        log(
            `${eligibleAffiliates.length} affiliates available after country filtering`,
        );
    }

    // If no eligible affiliates, return null
    if (eligibleAffiliates.length === 0) {
        log("No eligible affiliates available");
        return null;
    }

    try {
        // Generate affiliate markdown for the prompt, only including eligible affiliates
        const eligibleAffiliateMarkdown = eligibleAffiliates
            .map((affiliate) => {
                const weight = affiliate.weight
                    ? ` (Priority: ${affiliate.weight})`
                    : "";
                return `- ${affiliate.id}: ${affiliate.name} - ${affiliate.description}${weight}`;
            })
            .join("\n");

        // Use the markdown format for the LLM prompt
        const promptForLLM = `
Based on the following conversation content, determine which affiliate program would be most relevant to suggest.
Return ONLY the ID of the most relevant affiliate from the list below, or "none" if none are relevant.

When multiple affiliates are equally relevant to the conversation, prefer those with higher Priority values.
Some affiliates have a Priority field - these should be given preference when they are relevant to the conversation.

CONVERSATION CONTENT:
${combinedContent}

AVAILABLE AFFILIATES:
${eligibleAffiliateMarkdown}

AFFILIATE ID:`;

        // Use the openai-large model explicitly for better affiliate matching
        const completion = await generateTextPortkey(
            [{ role: "user", content: promptForLLM }],
            { model: "openai-large" },
        );

        const response = completion.choices[0]?.message?.content?.trim();

        if (!response || response.toLowerCase() === "none") {
            // Define the percentage chance of showing Ko-fi when no other affiliate is found
            const kofiShowPercentage = 5; // 5% chance to show Ko-fi

            // Generate a random number between 0-100
            const randomValue = Math.floor(Math.random() * 100);

            // Only show Ko-fi ad if the random value is below our threshold
            if (randomValue < kofiShowPercentage) {
                log(
                    `No relevant affiliate found by LLM, showing Ko-fi donation (${randomValue} < ${kofiShowPercentage}%)`,
                );
                // Find the Ko-fi affiliate in our data
                const kofiAffiliate = affiliatesData.find(
                    (a) => a.id === "kofi",
                );

                // Check if Ko-fi is blocked in the user's country
                if (
                    kofiAffiliate &&
                    userCountry &&
                    kofiAffiliate.blockedCountries &&
                    kofiAffiliate.blockedCountries.includes(userCountry)
                ) {
                    log(
                        `Ko-fi affiliate is blocked in user's country (${userCountry}), skipping ad`,
                    );
                    return null;
                }

                return kofiAffiliate || null;
            } else {
                log(
                    `No relevant affiliate found by LLM, skipping ad (${randomValue} >= ${kofiShowPercentage}%)`,
                );
                return null;
            }
        }

        // Extract just the affiliate ID from the response
        const affiliateIdMatch = response.match(/\b([a-zA-Z0-9]+)\b/);
        const affiliateId = affiliateIdMatch ? affiliateIdMatch[1] : null;

        if (!affiliateId) {
            // Define the percentage chance of showing Ko-fi when no valid ID is extracted
            const kofiShowPercentage = 30; // 30% chance to show Ko-fi

            // Generate a random number between 0-100
            const randomValue = Math.floor(Math.random() * 100);

            // Only show Ko-fi ad if the random value is below our threshold
            if (randomValue < kofiShowPercentage) {
                log(
                    `Could not extract affiliate ID from LLM response, showing Ko-fi (${randomValue} < ${kofiShowPercentage}%)`,
                );
                // Find the Ko-fi affiliate in our data
                const kofiAffiliate = affiliatesData.find(
                    (a) => a.id === "kofi",
                );

                // Check if Ko-fi is blocked in the user's country
                if (
                    kofiAffiliate &&
                    userCountry &&
                    kofiAffiliate.blockedCountries &&
                    kofiAffiliate.blockedCountries.includes(userCountry)
                ) {
                    log(
                        `Ko-fi affiliate is blocked in user's country (${userCountry}), skipping ad`,
                    );
                    return null;
                }

                return kofiAffiliate || null;
            } else {
                log(
                    `Could not extract affiliate ID from LLM response, skipping ad (${randomValue} >= ${kofiShowPercentage}%)`,
                );
                return null;
            }
        }

        // Find the affiliate in our data
        const matchedAffiliate = eligibleAffiliates.find(
            (a) => a.id === affiliateId,
        );

        if (!matchedAffiliate) {
            // Define the percentage chance of showing Ko-fi when affiliate ID isn't found
            const kofiShowPercentage = 30; // 30% chance to show Ko-fi

            // Generate a random number between 0-100
            const randomValue = Math.floor(Math.random() * 100);

            // Only show Ko-fi ad if the random value is below our threshold
            if (randomValue < kofiShowPercentage) {
                log(
                    `Affiliate ID ${affiliateId} not found in eligible affiliates, showing Ko-fi (${randomValue} < ${kofiShowPercentage}%)`,
                );
                // Find the Ko-fi affiliate in our data
                const kofiAffiliate = affiliatesData.find(
                    (a) => a.id === "kofi",
                );

                // Check if Ko-fi is blocked in the user's country
                if (
                    kofiAffiliate &&
                    userCountry &&
                    kofiAffiliate.blockedCountries &&
                    kofiAffiliate.blockedCountries.includes(userCountry)
                ) {
                    log(
                        `Ko-fi affiliate is blocked in user's country (${userCountry}), skipping ad`,
                    );
                    return null;
                }

                return kofiAffiliate || null;
            } else {
                log(
                    `Affiliate ID ${affiliateId} not found in eligible affiliates, skipping ad (${randomValue} >= ${kofiShowPercentage}%)`,
                );
                return null;
            }
        }

        log(
            `Found relevant affiliate: ${matchedAffiliate.name} (${matchedAffiliate.id})`,
        );
        return matchedAffiliate;
    } catch (error) {
        errorLog(`Error finding relevant affiliate: ${error.message}`);
        return null;
    }
}

/**
 * Generate an ad string for the given affiliate ID
 * @param {string} affiliateId - The ID of the affiliate to generate an ad for
 * @param {string} content - The original content to match language with
 * @param {Array} messages - The original messages for context
 * @param {boolean} markerFound - Whether the p-ads marker was found
 * @returns {Promise<string|null>} - The ad string or null if generation failed
 */
export async function generateAffiliateAd(
    affiliateId,
    content = "",
    messages = [],
    markerFound = false,
) {
    if (!affiliateId) {
        log("No affiliate ID provided for ad generation");
        return null;
    }

    try {
        // Find the affiliate in our data
        const affiliate = affiliatesData.find((a) => a.id === affiliateId);

        if (!affiliate) {
            log(`Affiliate ID ${affiliateId} not found in affiliate data`);
            return null;
        }

        // Create the referral link
        const referralLink = `${REDIRECT_BASE_URL}${affiliateId}`;

        // Get base ad text - simplified approach for all types
        let adTextSource = "";

        // Use the ad_text field if available
        if (affiliate.ad_text) {
            adTextSource = `\n---\n\n🌸 **Ad** 🌸\n${affiliate.ad_text.replace("{url}", referralLink)}`;
        }

        // First, contextualize and translate ad text if content is provided
        if (content && content.trim().length > 0) {
            // Collect context from the conversation
            const lastMessages = messages
                .slice(-3)
                .map((m) => m.content || "")
                .filter(Boolean);
            const conversationContext = [...lastMessages, content].join("\n");

            // Create a prompt that adapts the ad to the conversation context
            const contextualPrompt = `
You are an expert advertising copywriter who creates short, concise, and highly personalized ads based on conversation context.

IMPORTANT INSTRUCTIONS:
1. First, analyze the conversation context to understand the topic, style, and specific details (like language being discussed, technologies mentioned, etc.)
2. Create a SHORT and CONCISE advertisement that is highly relevant to this specific conversation
3. Maximum length should be 1 sentence - brevity is essential
4. Make the ad feel targeted and personalized to the conversation topic
5. Preserve the existing markdown links in the format [text](url) - these MUST remain intact
6. Match the language of the conversation (translate if needed) - INCLUDING the "Ad" label
7. Use a direct, engaging tone with specific references to the conversation topic
8. Return your response in this exact format: "LANGUAGE_NAME: your_contextualized_ad_text"
9. Remember. The shorter and more personal, the sweeter.
10. Do not change the link format. Use simple markdown links ONLY - no HTML tags.
11. The "🌸 **Ad** 🌸" label MUST be translated to match the conversation language
12. NEVER use HTML formatting (no <div>, <span>, <img> etc.) - use ONLY markdown syntax

CONVERSATION CONTEXT:
${conversationContext}

ORIGINAL ADVERTISEMENT TO ADAPT:
${adTextSource}

RESPONSE:`;

            try {
                // Use openai-large model for better link preservation
                const completion = await generateTextPortkey(
                    [
                        {
                            role: "system",
                            content:
                                "You are an expert advertising copywriter who creates short, concise, and highly personalized ads based on conversation context.",
                        },
                        { role: "user", content: contextualPrompt },
                    ],
                    { model: "openai-large" },
                );
                const response =
                    completion.choices[0]?.message?.content?.trim();

                if (response && response.length > 0) {
                    // Check if the response indicates English
                    if (response.toUpperCase().startsWith("ENGLISH:")) {
                        // Keep original text, strip the "ENGLISH:" prefix
                        adTextSource = response.substring(8).trim();
                        log(
                            `Content detected as English, contextualized ad text for ${affiliate.name} (${affiliateId})`,
                        );
                    } else {
                        // Extract language and translated text
                        const colonIndex = response.indexOf(":");
                        if (colonIndex > 0) {
                            const detectedLanguage = response
                                .substring(0, colonIndex)
                                .trim();
                            adTextSource = response
                                .substring(colonIndex + 1)
                                .trim();
                            log(
                                `Contextualized and translated ad for ${affiliate.name} (${affiliateId}) to ${detectedLanguage}`,
                            );
                        } else {
                            // If format is unexpected, use the response as is
                            adTextSource = response;
                            log(
                                `Received unformatted contextualized ad for ${affiliate.name} (${affiliateId})`,
                            );
                        }
                    }
                }
            } catch (translationError) {
                errorLog(`Error translating ad: ${translationError.message}`);
                // Continue with original text if translation fails
            }
        }

        // Image ads temporarily disabled
        // Format the final ad - with or without image based on markerFound
        let adText;
        // Always use standard format without image
        // Use different prefix for Ko-fi (direct support) vs sponsors
        const prefix =
            affiliateId === "kofi"
                ? "**Support Pollinations.AI:**"
                : "**Sponsor:**";
        adText = `\n\n---\n\n${prefix}\n${adTextSource}`;
        log(`Generated standard ad for ${affiliate.name} (${affiliateId})`);

        return adText;
    } catch (error) {
        errorLog(`Error generating affiliate ad: ${error.message}`);
        return null;
    }
}

/**
 * Extracts information about referral links in the content.
 * @param {string} content - The content to analyze for referral links.
 * @returns {Object} - Information about the referral links found.
 */
export function extractReferralLinkInfo(content) {
    // Initialize result object
    const result = {
        linkCount: 0,
        linkTexts: [],
        linkTextsString: "",
        topicsOrIds: [],
        topicsOrIdsString: "",
        affiliateIds: [],
    };

    if (!content) return result;

    // Regular expression to find referral links in the content
    // Format: [text](https://pollinations.ai/redirect/[id])
    const referralLinkRegex =
        /\[([^\]]+)\]\((https:\/\/pollinations\.ai\/redirect\/([a-zA-Z0-9]+))[^)]*\)/g;

    let match;
    while ((match = referralLinkRegex.exec(content)) !== null) {
        // Increment link count
        result.linkCount++;

        // Extract link text
        const linkText = match[1];
        result.linkTexts.push(linkText);

        // Extract affiliate ID from the URL
        const affiliateId = match[3];

        result.topicsOrIds.push(affiliateId);

        // Add affiliate ID to the list if it exists
        if (affiliateId) {
            result.affiliateIds.push(affiliateId);
        }
    }

    // Join arrays into strings for analytics
    result.linkTextsString = result.linkTexts.join(",");
    result.topicsOrIdsString = result.topicsOrIds.join(",");

    return result;
}
