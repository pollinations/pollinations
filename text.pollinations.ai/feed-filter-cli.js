#!/usr/bin/env node

import * as EventSource from 'eventsource';
import debug from 'debug';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import dns from 'dns';
import { promisify } from 'util';

// Promisify DNS lookup
const dnsReverse = promisify(dns.reverse);

// Load environment variables for feed password
dotenv.config();    

const log = debug('pollinations:filter');
debug.enable('pollinations:filter');

// Enhanced stats for tracking message counts and categorical properties
const stats = {
    total: 0,
    private: 0,
    public: 0,
    models: {},
    referrers: {},
    hasMarkdown: 0,
    hasHtml: 0,
    isRoblox: 0,
    isImagePollinationsReferrer: 0,
    tokens: {
        total: 0,
        byReferrer: {}
    },
    ips: {}
};

// Number of top IPs to track
const TOP_IPS_COUNT = 5;

// Number of top referrers to display
const TOP_REFERRERS_COUNT = 10;

// Array to store raw message data for JSON export
const rawMessageData = [];

// Helper functions for content detection
const hasMarkdown = (text) => {
    const markdownPatterns = [
        /#{1,6}\s+.+/,      // Headers
        /\[.+\]\(.+\)/,     // Links
        /\*\*.+\*\*/,       // Bold
        /`.+`/,             // Code
        /^\s*[-*+]\s+/m,    // Lists
        /^\s*\d+\.\s+/m     // Numbered lists
    ];
    return markdownPatterns.some(pattern => pattern.test(text));
};

const hasHtml = (text) => /<[^>]+>/i.test(text);

// Helper function to truncate text
const truncate = (text, maxLength = 300) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
};

// Helper function to convert messages to markdown
const messagesToMarkdown = (messages) => {
    if (!Array.isArray(messages)) return '';
    return messages.map(msg => 
        `**${msg.role}**:\n\n${truncate(msg.content)}\n`
    ).join('\n---\n\n');
};

// Helper function to increment counter for a category
const incrementCategoryCount = (category, value) => {
    if (!value) return;
    
    if (!stats[category][value]) {
        stats[category][value] = 1;
    } else {
        stats[category][value]++;
    }
};

// Helper function to track tokens by referrer
const trackTokensByReferrer = (referrer, tokenData) => {
    if (!referrer) referrer = 'unknown';
    
    // Initialize referrer token tracking if not exists
    if (!stats.tokens.byReferrer[referrer]) {
        stats.tokens.byReferrer[referrer] = {
            total: 0
        };
    }
    
    // Extract token counts from the data
    const totalTokens = tokenData?.total_tokens || 0;
    
    // Update token counts
    stats.tokens.total += totalTokens;
    stats.tokens.byReferrer[referrer].total += totalTokens;
};

// Helper function to track IP addresses
const trackIpAddress = (ip) => {
    if (!ip) return;
    
    // Store the full IP
    const fullIp = ip;
    
    if (!stats.ips[fullIp]) {
        stats.ips[fullIp] = {
            requests: 1,
            tokens: 0
        };
    } else {
        stats.ips[fullIp].requests++;
    }
};

// Helper function to resolve IP to hostname - only called for top IPs when printing stats
const resolveIpToHostname = async (ip) => {
    try {
        const hostnames = await dnsReverse(ip);
        return hostnames && hostnames.length > 0 ? hostnames[0] : null;
    } catch (error) {
        // Silently fail if resolution doesn't work
        return null;
    }
};

// Helper function to update IP token usage
const updateIpTokenUsage = (ip, tokens) => {
    if (!ip || !tokens) return;
    
    const fullIp = ip;
    if (stats.ips[fullIp]) {
        stats.ips[fullIp].tokens += tokens;
    }
};

// Helper function to calculate percentage
const calculatePercentage = (count, total) => {
    if (total === 0) return '0.00%';
    return ((count / total) * 100).toFixed(2) + '%';
};

// Helper function to sort object by values in descending order
const sortObjectByValues = (obj) => {
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
};

// Helper function to get top N items from an object
const getTopNItems = (obj, n, valueKey = null) => {
    let entries = Object.entries(obj);
    
    // If valueKey is provided, sort by that specific property
    if (valueKey) {
        entries = entries.sort((a, b) => b[1][valueKey] - a[1][valueKey]);
    } else {
        entries = entries.sort((a, b) => b[1] - a[1]);
    }
    
    return entries.slice(0, n).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
    }, {});
};

// Filter function that checks if a message matches the criteria
const matchesFilters = (data, options = {}) => {
    const { response, parameters, isPrivate } = data;
    const referrer = parameters?.referrer;

    // Check for Roblox first - this is a hard filter that applies to all messages
    // regardless of other filters
    if (!options.roblox) {
        // Check referrer, model name, and system prompt for Roblox
        const isRobloxReferrer = referrer && referrer.toLowerCase().includes('roblox');
        const isRobloxModel = parameters?.model && 
            (parameters.model.toLowerCase().includes('roblox') || parameters.model === 'roblox-rp');
        
        if (isRobloxReferrer || isRobloxModel) {
            return false;
        }
    }

    // Filter by privacy status
    if (options.onlyPrivate && !isPrivate) return false;
    if (options.onlyPublic && isPrivate) return false;

    // NEW: Filter out based on referrer substrings
    if (options.excludeReferrerSubstring && options.excludeReferrerSubstring.length > 0) {
        if (referrer) { // Only check if referrer exists
            const lowerCaseReferrer = referrer.toLowerCase();
            for (const substring of options.excludeReferrerSubstring) {
                if (lowerCaseReferrer.includes(substring.toLowerCase())) {
                    return false; // Exclude if any substring matches
                }
            }
        }
    }

    // Filter IN based on specific referrer value/regex
    if (options.referrer !== undefined) {
        if (options.referrer === false && referrer) return false; // --no-referrer
        if (options.referrer instanceof RegExp && (!referrer || !options.referrer.test(referrer))) return false;
        if (typeof options.referrer === 'string' && referrer !== options.referrer) return false;
    }

    // Check for markdown OR html if either option is specified
    if (options.hasMarkdown !== undefined || options.hasHtml !== undefined) {
        const hasMarkdownMatch = options.hasMarkdown === undefined || hasMarkdown(response) === options.hasMarkdown;
        const hasHtmlMatch = options.hasHtml === undefined || hasHtml(response) === options.hasHtml;
        if (!hasMarkdownMatch && !hasHtmlMatch) return false;
    }

    return true;
};

// Print current stats
const printStats = async () => {
    log('\nStats:');
    log(`Total messages: ${stats.total}`);
    log(`Public messages: ${stats.public} (${calculatePercentage(stats.public, stats.total)})`);
    log(`Private messages: ${stats.private} (${calculatePercentage(stats.private, stats.total)})`);
    
    if (stats.hasMarkdown > 0 || stats.hasHtml > 0) {
        log('\nContent Types:');
        log(`Contains Markdown: ${stats.hasMarkdown} (${calculatePercentage(stats.hasMarkdown, stats.total)})`);
        log(`Contains HTML: ${stats.hasHtml} (${calculatePercentage(stats.hasHtml, stats.total)})`);
    }
    
    if (Object.keys(stats.models).length > 0) {
        log('\nModels:');
        const sortedModels = sortObjectByValues(stats.models);
        Object.entries(sortedModels).forEach(([model, count]) => {
            log(`${model}: ${count} (${calculatePercentage(count, stats.total)})`);
        });
    }
    
    if (Object.keys(stats.referrers).length > 0) {
        log('\nTop Referrers:');
        const topReferrers = getTopNItems(stats.referrers, TOP_REFERRERS_COUNT);
        Object.entries(topReferrers).forEach(([referrer, count]) => {
            log(`${referrer || 'none'}: ${count} (${calculatePercentage(count, stats.total)})`);
        });
        
        // Show how many more referrers exist beyond the top ones
        const totalReferrers = Object.keys(stats.referrers).length;
        if (totalReferrers > TOP_REFERRERS_COUNT) {
            log(`... and ${totalReferrers - TOP_REFERRERS_COUNT} more referrers`);
        }
    }
    
    log('\nSpecial Referrers:');
    log(`Roblox: ${stats.isRoblox} (${calculatePercentage(stats.isRoblox, stats.total)})`);
    log(`Image Pollinations: ${stats.isImagePollinationsReferrer} (${calculatePercentage(stats.isImagePollinationsReferrer, stats.total)})`);
    
    // Print token statistics by referrer
    if (stats.tokens.total > 0) {
        log('\nToken Usage:');
        log(`Total Tokens: ${stats.tokens.total.toLocaleString()}`);
        
        log('\nToken Usage by Referrer:');
        const sortedReferrersByTokens = Object.entries(stats.tokens.byReferrer)
            .sort((a, b) => b[1].total - a[1].total)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
            
        Object.entries(sortedReferrersByTokens).forEach(([referrer, tokenData]) => {
            log(`${referrer}: ${tokenData.total.toLocaleString()} tokens (${calculatePercentage(tokenData.total, stats.tokens.total)})`);
        });
    }
    
    // Print top IP statistics - only one list sorted by requests
    if (Object.keys(stats.ips).length > 0) {
        log('\nTop IP Addresses by Requests:');
        const topIps = getTopNItems(stats.ips, TOP_IPS_COUNT, 'requests');
        
        // Resolve hostnames for top IPs only when displaying stats
        const resolvePromises = Object.keys(topIps).map(async (ip) => {
            const hostname = await resolveIpToHostname(ip);
            const hostnameInfo = hostname ? ` (${hostname})` : '';
            log(`${ip}${hostnameInfo}: ${topIps[ip].requests} requests, ${topIps[ip].tokens.toLocaleString()} tokens`);
        });
        
        // Wait for all resolutions to complete before continuing
        await Promise.all(resolvePromises);
    }
    
    log('-'.repeat(30));
};

// Main function to start the feed listener
const startFeedListener = async (options = {}) => {
    // Determine which feed URL to use based on options
    let baseUrl = options.baseUrl || 'https://text.pollinations.ai';
    let feedUrl = `${baseUrl}/feed`;
     
    // Check for password first (from options or environment)
    const password = options.password || process.env.FEED_PASSWORD;

    // If a password is provided, use the authenticated feed URL
    if (password) {
        feedUrl = `${baseUrl}/feed?password=${encodeURIComponent(password)}`;
        log('Using authenticated feed (includes private messages)');
    }
     
    log(`Connecting to feed at ${feedUrl.replace(/password=([^&]+)/, 'password=[REDACTED]')}`);
    const eventSource = new EventSource.EventSource(feedUrl);
    
    eventSource.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Check filters FIRST
            if (matchesFilters(data, options)) {
                
                // If JSON logging is enabled AND the message passes filters, save the raw data
                if (options.jsonOutputFile) {
                    // Extract only the metadata and numerical information we need
                    const { parameters, response, isPrivate, ip } = data;
                    
                    const messageData = {
                        timestamp: new Date().toISOString(),
                        isPrivate: isPrivate || false,
                        ip: ip ? ip : 'unknown',
                        metadata: {
                            referrer: parameters?.referrer || 'unknown',
                            model: parameters?.model || 'unknown',
                            isRobloxReferrer: parameters?.referrer?.toLowerCase().includes('roblox') || false,
                            isImagePollinationsReferrer: parameters?.isImagePollinationsReferrer || false
                        },
                        stats: {
                            promptTokens: parameters?.prompt_tokens || 0,
                            completionTokens: parameters?.completion_tokens || 0,
                            totalTokens: parameters?.total_tokens || 0,
                            promptLength: {
                                characters: parameters?.messages 
                                    ? parameters.messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) 
                                    : 0,
                                words: parameters?.messages 
                                    ? parameters.messages.reduce((sum, msg) => sum + (msg.content?.split(/\s+/).length || 0), 0) 
                                    : 0
                            },
                            completionLength: {
                                characters: response?.length || 0,
                                words: response?.split(/\s+/).length || 0
                            },
                            hasMarkdown: hasMarkdown(response || ''),
                            hasHtml: hasHtml(response || ''),
                            // Attempt to detect if the message is a roleplay based on asterisks
                            isRoleplay: /\*.+\*/.test(response || '') || parameters?.messages?.some(msg => /\*.+\*/.test(msg.content || '')) || false
                        },
                        // Store the first 100 chars of system message if available (for prompt analysis)
                        systemPromptPreview: parameters?.messages?.find(msg => msg.role === 'system')?.content?.substring(0, 100) || null
                    };
                    
                    // Save to our array
                    rawMessageData.push(messageData);
                    
                    // Write to file periodically to avoid memory issues
                    if (rawMessageData.length % 10 === 0) {
                        writeDataToJson(options.jsonOutputFile);
                    }
                }

                // --- Update stats and console output (only happens if filters match) ---
                stats.total++;
                if (data.isPrivate) {
                    stats.private++;
                } else {
                    stats.public++;
                }
                
                // Track categorical properties
                const { parameters, response, ip } = data;
                
                // Track model usage
                if (parameters?.model) {
                    incrementCategoryCount('models', parameters.model);
                }
                
                // Track referrers
                incrementCategoryCount('referrers', parameters?.referrer);
                
                // Track content types
                if (hasMarkdown(response)) {
                    stats.hasMarkdown++;
                }
                if (hasHtml(response)) {
                    stats.hasHtml++;
                }
                
                // Track special referrers
                if (parameters?.referrer && parameters.referrer.toLowerCase().includes('roblox')) {
                    stats.isRoblox++;
                }
                if (parameters?.isImagePollinationsReferrer) {
                    stats.isImagePollinationsReferrer++;
                }
                
                // Track token usage by referrer
                if (parameters) {
                    trackTokensByReferrer(parameters.referrer, parameters);
                }
                
                // Track IP address usage
                if (ip) {
                    trackIpAddress(ip);
                    
                    // Update token usage for this IP
                    if (parameters?.total_tokens) {
                        updateIpTokenUsage(ip, parameters.total_tokens);
                    }
                }
                
                // Only display content if not in count-only mode
                if (!options.countOnly) {
                    // Add privacy indicator to the output
                    const privacyStatus = data.isPrivate ? '🔒 PRIVATE' : '🌐 PUBLIC';
                    
                    console.log(`\n# ${privacyStatus} Message\n`);
                    console.log(`Referrer: ${data.parameters?.referrer || 'none'}`);
                    if (data.ip) console.log(`IP: ${data.ip}`);
                    
                    // Add token information if available
                    if (data.parameters?.total_tokens) {
                        console.log(`Tokens: ${data.parameters.total_tokens.toLocaleString()} total`);
                    }
                    
                    console.log('\n# Response\n');
                    console.log(truncate(data.response));
                    console.log('\n# Messages\n');
                    console.log(messagesToMarkdown(data.parameters.messages));
                    console.log('\n-------------------\n');
                }
                
                // Print stats based on mode
                if (options.countOnly) {
                    // In count-only mode, update stats more frequently
                    if (stats.total % 5 === 0) {
                        await printStats();
                    }
                } else if (stats.total % 10 === 0) {
                    // In normal mode, print stats every 10 messages
                    await printStats();
                }
            }
        } catch (error) {
            log('Error processing message: %O', error);
        }
    };

    eventSource.onerror = (error) => {
        if (error && error.status === 401) {
            log('Authentication failed: Invalid password');
            process.exit(1);
        } else {
            log('EventSource failed: %O', error);
        }
    };

    log('Connected to feed with filters: %O', options);

    // Handle cleanup on process exit
    process.on('SIGINT', async () => {
        eventSource.close();
        await printStats();
        
        // Save data to JSON if enabled
        if (options.jsonOutputFile) {
            writeDataToJson(options.jsonOutputFile);
            log(`Data saved to ${options.jsonOutputFile}`);
        }
        
        log('Disconnected from feed');
        process.exit(0);
    });
};

// Function to write collected data to JSON file
const writeDataToJson = (filePath) => {
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(rawMessageData, null, 2));
        log(`Data saved to ${filePath} (${rawMessageData.length} entries)`);
    } catch (error) {
        log('Error writing to JSON file: %O', error);
    }
};

// Parse command line arguments
const parseArgs = () => {
    const program = new Command();

    program
        .option('--no-referrer', 'Only show messages without a referrer')
        .option('--referrer <value>', 'Filter by specific referrer')
        .option('--has-markdown', 'Only show messages containing markdown')
        .option('--has-html', 'Only show messages containing HTML')
        .option('--no-roblox', 'Filter out messages with Roblox referrers')
        .option('--exclude-referrer-substring <value>', 'Filter out messages where referrer contains this substring (can be used multiple times)', (value, previous) => (previous || []).concat([value]), [])
        .option('--only-private', 'Show only private messages (requires password)')
        .option('--only-public', 'Show only public messages')
        .option('--password <value>', 'Password for accessing private messages')
        .option('--base-url <url>', 'Base URL for API (default: https://text.pollinations.ai)')
        .option('--count-only', 'Only display statistics, not individual messages')
        .option('--json-output <file>', 'Save raw data to JSON file for later analysis')
 
     program.parse(process.argv);

    return program.opts();
};

// Start the application
const options = parseArgs();
startFeedListener(options);
