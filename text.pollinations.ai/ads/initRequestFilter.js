import { generateTextPortkey } from "../generateTextPortkey.js";
import debug from "debug";
import { sendToAnalytics } from "../sendToAnalytics.js";
import { getRequestData } from "../requestUtils.js";
import {
  findRelevantAffiliate,
  generateAffiliateAd,
  extractReferralLinkInfo,
  REDIRECT_BASE_URL,
} from "./adLlmMapper.js";
import { Transform } from "stream";
import { logAdInteraction } from "./adLogger.js";
import { affiliatesData } from "../../affiliate/affiliates.js";

const log = debug("pollinations:adfilter");
const errorLog = debug("pollinations:adfilter:error");

// Regular expression to detect markdown formatting in content
const markdownRegex =
  /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Probability of adding referral links (10%)
const REFERRAL_LINK_PROBABILITY = 0.07;

// Flag for testing ads with a specific marker
const TEST_ADS_MARKER = "p-ads";

// Whether to require markdown for ad processing
const REQUIRE_MARKDOWN = true;

// Parse bad domains from environment variable (comma-separated list)
const BAD_DOMAINS = process.env.BAD_DOMAINS
  ? process.env.BAD_DOMAINS.split(",").map((domain) =>
      domain.trim().toLowerCase(),
    )
  : [];

// Create a flattened list of all trigger words from all affiliates
const ALL_TRIGGER_WORDS = affiliatesData.reduce((words, affiliate) => {
  if (affiliate.triggerWords && Array.isArray(affiliate.triggerWords)) {
    return [...words, ...affiliate.triggerWords];
  }
  return words;
}, []);

// Function to check if content contains any trigger words
function contentContainsTriggerWords(content) {
  if (!content || typeof content !== "string") {
    return false;
  }

  // Convert content to lowercase for case-insensitive matching
  const lowercaseContent = content.toLowerCase();

  // Check if content contains any trigger word (case insensitive)
  return ALL_TRIGGER_WORDS.some((word) =>
    lowercaseContent.includes(word.toLowerCase()),
  );
}

// Function to get user's country code from request
function getUserCountry(req) {
  if (!req) return null;

  // Check for country code in headers (common for proxies like Cloudflare)
  const cfCountry = req.headers["cf-ipcountry"];
  if (cfCountry) {
    log(`Country from Cloudflare header: ${cfCountry}`);
    return cfCountry;
  }

  // Check for country in X-Geo-Country header (some CDNs use this)
  const xGeoCountry = req.headers["x-geo-country"];
  if (xGeoCountry) {
    log(`Country from X-Geo-Country header: ${xGeoCountry}`);
    return xGeoCountry;
  }

  // If no country information is available, return null
  log("No country information found in request headers");
  return null;
}

// Extracted utility functions
function shouldShowAds(content, messages = [], req = null) {
  // Check for the test marker first - if found, immediately return true
  let markerFound = false;

  // Check for marker in content
  if (content && typeof content === "string") {
    markerFound = content.includes(TEST_ADS_MARKER);

    // If marker is found, force ad display regardless of other conditions
    if (markerFound) {
      log(
        'Test marker "p-ads" found in content, forcing ad display regardless of other conditions',
      );
      return { shouldShowAd: true, markerFound: true, forceAd: true };
    }
  }

  // Also check for marker in messages (important for streaming case)
  if (!markerFound && messages && messages.length > 0) {
    // Convert all message contents to strings for consistent checking
    const messageContents = messages.map((msg) => {
      if (!msg) return "";
      if (typeof msg.content === "string") return msg.content;
      if (msg.content) return JSON.stringify(msg.content);
      return "";
    });

    // Check if any message contains the marker
    markerFound = messageContents.some((content) =>
      content.includes(TEST_ADS_MARKER),
    );

    if (markerFound) {
      log(
        'Test marker "p-ads" found in messages, forcing ad display regardless of other conditions',
      );
      return { shouldShowAd: true, markerFound: true, forceAd: true };
    }
  }

  // Get request data for referrer check
  const requestData = getRequestData(req);

  // Special handling for bad domains in referrer
  if (
    requestData &&
    requestData.referrer &&
    requestData.referrer !== "unknown" &&
    BAD_DOMAINS.length > 0
  ) {
    const referrerLower = requestData.referrer.toLowerCase();

    // Check if referrer contains any bad domain
    const isBadDomain = BAD_DOMAINS.some((domain) =>
      referrerLower.includes(domain),
    );

    if (isBadDomain) {
      log(
        `Bad domain detected in referrer: ${requestData.referrer}, forcing 100% ad probability`,
      );
      return { shouldShowAd: true, markerFound: true, isBadDomain: true };
    }
  }

  // Skip ad processing if referrer is from roblox or image.pollinations.ai
  if (
    requestData &&
    requestData.referrer &&
    requestData.referrer !== "unknown" &&
    (requestData.referrer?.includes("roblox") ||
      requestData.referrer?.includes("image.pollinations.ai"))
  ) {
    // log('Skipping ad processing due to referrer presence:', requestData.referrer);
    return { shouldShowAd: false, markerFound: false };
  }

  // Check if an ad already exists in the conversation history
  if (messages && messages.length > 0) {
    // Look for the redirect URL pattern in any of the messages
    const hasExistingAd = messages.some((msg) => {
      if (!msg.content || typeof msg.content !== "string") return false;
      return msg.content.includes(REDIRECT_BASE_URL);
    });

    if (hasExistingAd) {
      log("Ad already exists in conversation history, skipping additional ad");
      return { shouldShowAd: false, markerFound: false, adAlreadyExists: true };
    }
  }

  // Skip ad generation if content is too short
  if (!content || typeof content !== "string" || content.length < 100) {
    return { shouldShowAd: false, markerFound: false };
  }

  // Skip if content does not have markdown-like formatting, unless we're testing
  // This helps distinguish actual text responses from other formats like code
  if (
    REQUIRE_MARKDOWN &&
    !markdownRegex.test(content) &&
    !content.includes(TEST_ADS_MARKER)
  ) {
    log("Skipping ad processing due to lack of markdown formatting");
    return { shouldShowAd: false, markerFound: false };
  }

  // Check for trigger words in content or messages
  let triggerWordsFound = false;
  if (content) {
    triggerWordsFound = contentContainsTriggerWords(content);
  }
  if (!triggerWordsFound && messages && messages.length > 0) {
    triggerWordsFound = messages.some(
      (msg) => msg.content && contentContainsTriggerWords(msg.content),
    );
  }

  // If marker is not found, use the default probability
  const effectiveProbability = markerFound
    ? 1.0 // 100% probability for marker found
    : triggerWordsFound
      ? REFERRAL_LINK_PROBABILITY * 2 // Triple probability for trigger words
      : REFERRAL_LINK_PROBABILITY;

  if (markerFound) {
    log('Test marker "p-ads" found, using 100% probability');
  } else if (triggerWordsFound) {
    log(
      `Trigger words found in content, using triple probability (${(REFERRAL_LINK_PROBABILITY * 3).toFixed(2)})`,
    );
  }

  // Random check - only process based on the effective probability
  const shouldShowAd = Math.random() <= effectiveProbability;

  return { shouldShowAd, markerFound };
}

/**
 * Send analytics about skipped ads
 * @param {object} req - Express request object for analytics
 * @param {string} reason - Reason why the ad was skipped
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @param {object} additionalData - Any additional data to include
 */
export function sendAdSkippedAnalytics(
  req,
  reason,
  isStreaming = false,
  additionalData = {},
) {
  if (!req) return;

  log(`Ad skipped: ${reason}, streaming: ${isStreaming}`);

  sendToAnalytics(req, "ad_skipped", {
    reason,
    streaming: isStreaming,
    ...additionalData,
  });
}

function shouldProceedWithAd(content, markerFound) {
  // If no content, skip ad processing
  if (!content) {
    return false;
  }

  // Skip if content is too short (less than 50 characters)
  if (content.length < 50) {
    return false;
  }

  // If markdown is required and not found, skip (unless marker is present)
  if (REQUIRE_MARKDOWN && !markerFound && !markdownRegex.test(content)) {
    return false;
  }

  return true;
}

async function generateAdForContent(
  content,
  req,
  messages,
  markerFound = false,
  isStreaming = false,
) {
  // Log the function call with details
  log(
    `generateAdForContent called with isStreaming=${isStreaming}, markerFound=${markerFound}, content length=${content ? content.length : 0}`,
  );

  // For streaming requests, log more details about the content
  if (isStreaming) {
    if (content) {
      log(
        `Streaming content sample (first 100 chars): ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`,
      );
    } else {
      log("No content provided for streaming ad generation");
    }

    // Log message count
    log(
      `Message count for streaming ad generation: ${messages ? messages.length : 0}`,
    );
  }

  // Skip if we've already processed this request ID
  if (req && req.pollinationsAdProcessed) {
    log("Request already processed for ads, skipping duplicate processing");
    return null;
  }

  // Mark request as processed
  if (req) {
    req.pollinationsAdProcessed = true;
  }

  // Get user's country code
  const userCountry = getUserCountry(req);
  log(`User country detected: ${userCountry || "unknown"}`);

  // Check if we should show ads for this content
  const {
    shouldShowAd,
    markerFound: detectedMarker,
    isBadDomain,
    adAlreadyExists,
    forceAd,
  } = shouldShowAds(content, messages, req);

  // Handle bad domain referrers - always show ads (100% probability)
  if (isBadDomain) {
    markerFound = true; // Force marker to true to ensure 100% probability
  }

  // If p-ads marker was found, set forceAd flag
  const shouldForceAd = forceAd || false;

  if (
    !shouldShowAd &&
    !shouldProceedWithAd(content, markerFound || detectedMarker) &&
    !shouldForceAd
  ) {
    if (req) {
      const reason = !content
        ? "empty_content"
        : content.length < 100
          ? "content_too_short"
          : adAlreadyExists
            ? "ad_already_exists"
            : "probability_check_failed";

      sendAdSkippedAnalytics(req, reason, isStreaming);
    }
    return null;
  }

  try {
    log("Generating ad for content...");

    // Find the relevant affiliate, passing the user's country code
    const affiliateData = await findRelevantAffiliate(
      content,
      messages,
      userCountry,
    );

    // If no affiliate data is found but we should force an ad (p-ads marker present)
    if (!affiliateData && shouldForceAd) {
      log(
        "No relevant affiliate found, but p-ads marker is present. Using Ko-fi as fallback.",
      );
      // Find the Ko-fi affiliate in our data as a guaranteed fallback
      const kofiAffiliate = affiliatesData.find((a) => a.id === "kofi");

      if (kofiAffiliate) {
        // Check if Ko-fi is blocked in user's country
        if (
          userCountry &&
          kofiAffiliate.blockedCountries &&
          kofiAffiliate.blockedCountries.includes(userCountry)
        ) {
          log(
            `Ko-fi affiliate is blocked in user's country (${userCountry}), skipping ad`,
          );
          sendAdSkippedAnalytics(req, "country_blocked", isStreaming, {
            affiliate_id: "kofi",
            affiliate_name: kofiAffiliate.name,
            country: userCountry,
          });
          return null;
        }

        // Generate the ad string for Ko-fi
        const adString = await generateAffiliateAd("kofi", content, messages);

        if (adString) {
          // Extract info for analytics
          const linkInfo = extractReferralLinkInfo(adString);

          // Log the ad interaction with metadata
          if (req) {
            logAdInteraction({
              timestamp: new Date().toISOString(),
              ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
              affiliate_id: "kofi",
              affiliate_name: kofiAffiliate.name,
              topic: linkInfo.topic || "unknown",
              streaming: isStreaming,
              referrer:
                req.headers.referer ||
                req.headers.referrer ||
                req.headers.origin ||
                "unknown",
              user_agent: req.headers["user-agent"] || "unknown",
              country: userCountry || "unknown",
            });

            // Send analytics for the ad impression
            sendToAnalytics(req, "ad_impression", {
              affiliate_id: "kofi",
              affiliate_name: kofiAffiliate.name,
              topic: linkInfo.topic || "unknown",
              streaming: isStreaming,
              forced: true,
              country: userCountry || "unknown",
            });
          }

          return adString;
        }
      }
    }

    // If no affiliate data is found and not forcing an ad, send analytics and return null
    if (!affiliateData && req && !shouldForceAd) {
      sendAdSkippedAnalytics(req, "no_relevant_affiliate", isStreaming);
      return null;
    }

    // If affiliate data is found, generate the ad string
    if (affiliateData) {
      // Pass content and messages to enable language matching
      const adString = await generateAffiliateAd(
        affiliateData.id,
        content,
        messages,
      );

      // If ad generation failed but we should force an ad (p-ads marker present)
      if (!adString && shouldForceAd) {
        log(
          "Ad generation failed, but p-ads marker is present. Using Ko-fi as fallback.",
        );
        // Try with Ko-fi as a fallback
        const kofiAdString = await generateAffiliateAd(
          "kofi",
          content,
          messages,
        );

        if (kofiAdString && req) {
          // Extract info for analytics
          const linkInfo = extractReferralLinkInfo(kofiAdString);

          // Log the ad interaction with metadata
          logAdInteraction({
            timestamp: new Date().toISOString(),
            ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
            affiliate_id: "kofi",
            affiliate_name: "Support Pollinations on Ko-fi",
            topic: linkInfo.topic || "unknown",
            streaming: isStreaming,
            referrer:
              req.headers.referer ||
              req.headers.referrer ||
              req.headers.origin ||
              "unknown",
            user_agent: req.headers["user-agent"] || "unknown",
          });

          // Send analytics for the ad impression
          sendToAnalytics(req, "ad_impression", {
            affiliate_id: "kofi",
            affiliate_name: "Support Pollinations on Ko-fi",
            topic: linkInfo.topic || "unknown",
            streaming: isStreaming,
            forced: true,
          });

          return kofiAdString;
        }
      }

      // If ad generation failed and not forcing an ad, send analytics
      if (!adString && req && !shouldForceAd) {
        sendAdSkippedAnalytics(req, "ad_generation_failed", isStreaming, {
          affiliate_id: affiliateData.id,
          affiliate_name: affiliateData.name,
        });
        return null;
      }

      // If an ad string was successfully generated
      if (adString) {
        // Extract info for analytics
        const linkInfo = extractReferralLinkInfo(adString);

        // Log the ad interaction with metadata
        if (req) {
          logAdInteraction({
            timestamp: new Date().toISOString(),
            ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
            affiliate_id: affiliateData.id,
            affiliate_name: affiliateData.name,
            topic: linkInfo.topic || "unknown",
            streaming: isStreaming,
            referrer:
              req.headers.referer ||
              req.headers.referrer ||
              req.headers.origin ||
              "unknown",
            user_agent: req.headers["user-agent"] || "unknown",
          });

          // Send analytics for the ad impression
          sendToAnalytics(req, "ad_impression", {
            affiliate_id: affiliateData.id,
            affiliate_name: affiliateData.name,
            topic: linkInfo.topic || "unknown",
            streaming: isStreaming,
            forced: shouldForceAd,
          });
        }

        return adString;
      }
    }

    // If we get here and should force an ad, create a generic Ko-fi ad as last resort
    if (shouldForceAd) {
      log(
        "All ad generation attempts failed, but p-ads marker is present. Creating generic Ko-fi ad.",
      );
      const genericKofiAd =
        "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

      if (req) {
        // Log the ad interaction with metadata
        logAdInteraction({
          timestamp: new Date().toISOString(),
          ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
          affiliate_id: "kofi",
          affiliate_name: "Support Pollinations on Ko-fi",
          topic: "generic",
          streaming: isStreaming,
          referrer:
            req.headers.referer ||
            req.headers.referrer ||
            req.headers.origin ||
            "unknown",
          user_agent: req.headers["user-agent"] || "unknown",
        });

        // Send analytics for the ad impression
        sendToAnalytics(req, "ad_impression", {
          affiliate_id: "kofi",
          affiliate_name: "Support Pollinations on Ko-fi",
          topic: "generic",
          streaming: isStreaming,
          forced: true,
        });
      }

      return genericKofiAd;
    }

    return null;
  } catch (error) {
    errorLog(`Error generating ad: ${error.message}`);

    // If error occurs but we should force an ad, return a generic Ko-fi ad
    if (shouldForceAd) {
      log(
        "Error occurred, but p-ads marker is present. Creating generic Ko-fi ad as fallback.",
      );
      const genericKofiAd =
        "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

      if (req) {
        // Log the ad interaction with metadata
        logAdInteraction({
          timestamp: new Date().toISOString(),
          ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
          affiliate_id: "kofi",
          affiliate_name: "Support Pollinations on Ko-fi",
          topic: "error_fallback",
          streaming: isStreaming,
          referrer:
            req.headers.referer ||
            req.headers.referrer ||
            req.headers.origin ||
            "unknown",
          user_agent: req.headers["user-agent"] || "unknown",
        });

        // Send analytics for the ad impression
        sendToAnalytics(req, "ad_impression", {
          affiliate_id: "kofi",
          affiliate_name: "Support Pollinations on Ko-fi",
          topic: "error_fallback",
          streaming: isStreaming,
          forced: true,
          error: error.message,
        });
      }

      return genericKofiAd;
    }

    if (req) {
      sendAdSkippedAnalytics(req, "error", isStreaming, {
        error_message: error.message,
      });
    }
    return null;
  }
}

function formatAdAsSSE(adString) {
  try {
    // Log that we're formatting an ad as SSE
    log(
      `Formatting ad as SSE: ${adString.substring(0, 50)}${adString.length > 50 ? "..." : ""}`,
    );

    // Create a proper SSE message with the ad content
    // This should be in the format expected by the client

    // Create a delta object similar to what the API would return
    const deltaObject = {
      id: `ad_${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "ad-system",
      choices: [
        {
          index: 0,
          delta: {
            content: `\n\n${adString}`,
          },
          finish_reason: null,
        },
      ],
    };

    // Format as SSE
    const formattedSSE = `data: ${JSON.stringify(deltaObject)}\n\n`;

    // Log the formatted SSE (truncated for brevity)
    log(
      `Formatted SSE (truncated): ${formattedSSE.substring(0, 100)}${formattedSSE.length > 100 ? "..." : ""}`,
    );

    return formattedSSE;
  } catch (error) {
    errorLog(`Error formatting ad as SSE: ${error.message}`);
    errorLog(`Error stack: ${error.stack}`);
    return "";
  }
}

/**
 * Process content and add referral links if markdown is detected
 * @param {string} content - The output content to process
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages (optional)
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processRequestForAds(content, req, messages = []) {
  const { shouldShowAd, markerFound, forceAd } = shouldShowAds(
    content,
    messages,
    req,
  );

  // If p-ads marker was found, set forceAd flag
  const shouldForceAd = forceAd || false;

  if (!shouldShowAd && !shouldForceAd) {
    // We've already sent the ad_skipped analytics in shouldShowAds
    return content;
  }

  // Generate ad string based on content
  const adString = await generateAdForContent(
    content,
    req,
    messages,
    markerFound,
  );

  if (adString) {
    return content + adString;
  }

  // If we should force an ad but none was generated, create a generic Ko-fi ad
  if (shouldForceAd) {
    log(
      "No ad generated but p-ads marker is present. Creating generic Ko-fi ad for non-streaming response.",
    );
    const genericKofiAd =
      "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

    if (req) {
      // Log the ad interaction with metadata
      logAdInteraction({
        timestamp: new Date().toISOString(),
        ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
        affiliate_id: "kofi",
        affiliate_name: "Support Pollinations on Ko-fi",
        topic: "nonstreaming_fallback",
        streaming: false,
        referrer:
          req.headers.referer ||
          req.headers.referrer ||
          req.headers.origin ||
          "unknown",
        user_agent: req.headers["user-agent"] || "unknown",
      });

      // Send analytics for the ad impression
      sendToAnalytics(req, "ad_impression", {
        affiliate_id: "kofi",
        affiliate_name: "Support Pollinations on Ko-fi",
        topic: "nonstreaming_fallback",
        streaming: false,
        forced: true,
        fallback: true,
      });
    }

    return content + genericKofiAd;
  }

  // We've already sent the ad_skipped analytics in generateAdForContent
  return content;
}

/**
 * Creates a streaming wrapper that adds an ad at the end of the stream
 * This maintains the thin proxy approach for most of the stream
 * @param {Stream} responseStream - The original response stream from the API
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages
 * @returns {Stream} - A transformed stream that will add an ad at the end
 */
export function createStreamingAdWrapper(responseStream, req, messages = []) {
  if (!responseStream || !responseStream.pipe) {
    log("Invalid stream provided to createStreamingAdWrapper");
    if (req) {
      sendAdSkippedAnalytics(req, "invalid_stream", true);
    }
    return responseStream;
  }

  const { shouldShowAd, markerFound, adAlreadyExists, forceAd } = shouldShowAds(
    null,
    messages,
    req,
  );

  // If p-ads marker was found, set forceAd flag
  const shouldForceAd = forceAd || false;

  // Only check for existing ads if we're not forcing an ad
  if (adAlreadyExists && !shouldForceAd) {
    log("Ad already exists in conversation history, skipping streaming ad");
    if (req) {
      sendAdSkippedAnalytics(req, "ad_already_exists", true);
    }
    return responseStream;
  }

  // Only skip if we're not forcing an ad
  if (!shouldShowAd && !shouldForceAd) {
    // We've already sent the ad_skipped analytics in shouldShowAds
    return responseStream;
  }

  log(
    "Creating streaming ad wrapper" +
      (shouldForceAd ? " (forced by p-ads)" : ""),
  );

  // Log the messages for debugging
  if (messages && messages.length > 0) {
    log(`Processing streaming with ${messages.length} messages`);
    // Log the first message content (truncated for brevity)
    const firstMessageContent = messages[0].content;
    if (typeof firstMessageContent === "string") {
      log(
        `First message content (truncated): ${firstMessageContent.substring(0, 100)}${firstMessageContent.length > 100 ? "..." : ""}`,
      );
    } else if (firstMessageContent) {
      log(
        `First message content is not a string: ${typeof firstMessageContent}`,
      );
    }
  } else {
    log("No messages provided to streaming ad wrapper");
  }

  // Collect the content to analyze for affiliate matching
  let collectedContent = "";
  let isDone = false;

  // Log when we start collecting content
  log("Starting to collect content from stream chunks");

  // Create a transform stream that will:
  // 1. Pass through all chunks unchanged
  // 2. Collect content for analysis
  // 3. Add an ad after the [DONE] message
  const streamTransformer = new Transform({
    objectMode: true,
    transform(chunk, _encoding, callback) {
      // Convert chunk to string
      const chunkStr = chunk.toString();

      // Check if this is the [DONE] message
      if (chunkStr.includes("data: [DONE]")) {
        isDone = true;

        // Process the collected content and add an ad
        generateAdForContent(collectedContent, req, messages, markerFound, true)
          .then((adString) => {
            if (adString) {
              // Format the ad as a proper SSE message
              const adChunk = formatAdAsSSE(adString);

              // Push the ad chunk before the [DONE] message
              this.push(adChunk);
            } else if (shouldForceAd) {
              // If we're forcing an ad but none was generated, create a generic Ko-fi ad
              log(
                "No ad generated but p-ads marker is present. Creating generic Ko-fi ad for streaming.",
              );
              const genericKofiAd =
                "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
              const adChunk = formatAdAsSSE(genericKofiAd);

              // Push the ad chunk before the [DONE] message
              this.push(adChunk);

              if (req) {
                // Log the ad interaction with metadata
                logAdInteraction({
                  timestamp: new Date().toISOString(),
                  ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
                  affiliate_id: "kofi",
                  affiliate_name: "Support Pollinations on Ko-fi",
                  topic: "streaming_fallback",
                  streaming: true,
                  referrer:
                    req.headers.referer ||
                    req.headers.referrer ||
                    req.headers.origin ||
                    "unknown",
                  user_agent: req.headers["user-agent"] || "unknown",
                });

                // Send analytics for the ad impression
                sendToAnalytics(req, "ad_impression", {
                  affiliate_id: "kofi",
                  affiliate_name: "Support Pollinations on Ko-fi",
                  topic: "streaming_fallback",
                  streaming: true,
                  forced: true,
                  fallback: true,
                });
              }
            } else {
              // We've already sent the ad_skipped analytics in generateAdForContent
            }

            // Push the [DONE] message
            this.push(chunk);
            callback();
          })
          .catch((error) => {
            errorLog("Error processing streaming ad:", error);

            if (shouldForceAd) {
              // If error occurs but we should force an ad, create a generic Ko-fi ad
              log(
                "Error occurred, but p-ads marker is present. Creating generic Ko-fi ad for streaming.",
              );
              const genericKofiAd =
                "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
              const adChunk = formatAdAsSSE(genericKofiAd);

              // Push the ad chunk before the [DONE] message
              this.push(adChunk);

              if (req) {
                // Log the ad interaction with metadata
                logAdInteraction({
                  timestamp: new Date().toISOString(),
                  ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
                  affiliate_id: "kofi",
                  affiliate_name: "Support Pollinations on Ko-fi",
                  topic: "error_streaming_fallback",
                  streaming: true,
                  referrer:
                    req.headers.referer ||
                    req.headers.referrer ||
                    req.headers.origin ||
                    "unknown",
                  user_agent: req.headers["user-agent"] || "unknown",
                });

                // Send analytics for the ad impression
                sendToAnalytics(req, "ad_impression", {
                  affiliate_id: "kofi",
                  affiliate_name: "Support Pollinations on Ko-fi",
                  topic: "error_streaming_fallback",
                  streaming: true,
                  forced: true,
                  error: error.message,
                });
              }
            } else if (req) {
              sendAdSkippedAnalytics(req, "error", true, {
                error_message: error.message,
              });
            }

            // Push the [DONE] message
            this.push(chunk);
            callback();
          });
      } else {
        // For normal chunks, extract the content and pass through unchanged
        if (!isDone) {
          try {
            // Try to extract content from the SSE data
            // First, try the standard SSE format with data: prefix
            const contentMatches = chunkStr.match(/data: (.*?)(?:\n\n|$)/g);

            if (contentMatches && contentMatches.length > 0) {
              // Process each match (there might be multiple data: lines in one chunk)
              for (const match of contentMatches) {
                const dataContent = match.replace(/^data: /, "").trim();

                if (dataContent) {
                  try {
                    // Try to parse as JSON first
                    const data = JSON.parse(dataContent);

                    // Handle different response formats
                    if (data.choices && data.choices.length > 0) {
                      // Standard OpenAI format
                      const choice = data.choices[0];

                      if (choice.delta && choice.delta.content) {
                        // Streaming format with delta
                        collectedContent += choice.delta.content;
                      } else if (choice.message && choice.message.content) {
                        // Non-streaming format with message
                        collectedContent += choice.message.content;
                      } else if (choice.text) {
                        // Older API format
                        collectedContent += choice.text;
                      }
                    } else if (data.content) {
                      // Simple content field
                      collectedContent += data.content;
                    } else if (typeof data === "string") {
                      // Direct string response
                      collectedContent += data;
                    }
                  } catch (e) {
                    // If not valid JSON, treat as plain text
                    // This handles cases where the response is not JSON
                    if (dataContent !== "[DONE]") {
                      collectedContent += dataContent;
                    }
                  }
                }
              }
            } else {
              // If no data: prefix found, try to use the chunk as is
              // This is a fallback for non-standard SSE formats
              const plainText = chunkStr.trim();
              if (plainText && !plainText.includes("[DONE]")) {
                try {
                  // Try to parse as JSON
                  const data = JSON.parse(plainText);
                  if (data.choices && data.choices[0]) {
                    if (
                      data.choices[0].delta &&
                      data.choices[0].delta.content
                    ) {
                      collectedContent += data.choices[0].delta.content;
                    } else if (
                      data.choices[0].message &&
                      data.choices[0].message.content
                    ) {
                      collectedContent += data.choices[0].message.content;
                    }
                  }
                } catch (e) {
                  // If not JSON, use as plain text
                  collectedContent += plainText;
                }
              }
            }

            // Log collected content periodically (every 500 chars)
            if (collectedContent.length % 500 < 10) {
              log(`Collected content length: ${collectedContent.length} chars`);
            }
          } catch (e) {
            // Log but don't fail on content extraction errors
            errorLog(
              `Error extracting content from stream chunk: ${e.message}`,
            );
          }
        }

        // Pass through the chunk unchanged
        this.push(chunk);
        callback();
      }
    },
  });

  // Pipe the original stream through our transformer
  return responseStream.pipe(streamTransformer);
}
