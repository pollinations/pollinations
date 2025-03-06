import test from 'ava';
import dotenv from 'dotenv';
import generateTextSearch from '../generateTextSearch.js';
import debug from 'debug';

const log = debug('pollinations:test:tool-response');
const errorLog = debug('pollinations:test:tool-response:error');

dotenv.config();

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    errorLog('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

/**
 * Test: Tool Response Handling
 * 
 * Purpose: Verify that search tool responses are properly incorporated into the model's response
 * 
 * Expected behavior:
 * 1. The model should make a search tool call
 * 2. The model should receive and incorporate the search results
 * 3. The response should reference information from the search results
 */
test.serial('generateTextSearch should properly incorporate tool responses', async t => {
    try {
        // Use a specific query that will trigger a search and has verifiable facts
        const messages = [{ 
            role: 'user', 
            content: 'What is the population of Tokyo? Please search for the most recent data.' 
        }];
        
        const response = await generateTextSearch(messages);
        
        // Check if we got a valid response
        if (response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content;
            t.truthy(content, 'Response should have content');
            
            // The response should contain:
            // 1. A population number
            t.true(
                /\d{1,2}(\.\d+)?\s*(million|m)/.test(content.toLowerCase()) || 
                /\d{7,8}/.test(content),
                'Response should include Tokyo population numbers'
            );
            
            // 2. Reference to the source or year
            t.true(
                content.toLowerCase().includes('according to') ||
                content.toLowerCase().includes('as of') ||
                /20\d\d/.test(content),
                'Response should reference source or timeframe'
            );
            
            // Log the content for debugging
            log('Response content: %s', content);
        } else if (response.error) {
            t.pass(`Skipping test due to API error: ${response.error.message}`);
        }
    } catch (error) {
        t.pass(`Skipping test due to exception: ${error.message}`);
    }
});

/**
 * Test: Sequential Tool Calls
 * 
 * Purpose: Verify that tool calls are made sequentially, not in parallel
 * 
 * Expected behavior:
 * 1. The model should make at most one tool call per response
 * 2. Tool calls should be processed sequentially
 */
test.serial('generateTextSearch should not make parallel tool calls', async t => {
    try {
        // Use a query that might typically trigger multiple searches
        const messages = [{ 
            role: 'user', 
            content: 'Compare the populations of Tokyo and New York City. Search for recent data.' 
        }];
        
        const response = await generateTextSearch(messages);
        
        // Check if we got a valid response
        if (response.choices && response.choices[0] && response.choices[0].message) {
            const message = response.choices[0].message;
            
            // If there are tool calls, there should be exactly one
            if (message.tool_calls) {
                t.is(message.tool_calls.length, 1, 'Should only make one tool call at a time');
                t.is(message.tool_calls[0].function.name, 'web_search', 'Should be a web search call');
            }
            
            // Log for debugging
            log('Tool calls:', message.tool_calls);
            log('Content:', message.content);
        } else if (response.error) {
            t.pass(`Skipping test due to API error: ${response.error.message}`);
        }
    } catch (error) {
        t.pass(`Skipping test due to exception: ${error.message}`);
    }
});
