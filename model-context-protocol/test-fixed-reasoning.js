#!/usr/bin/env node

/**
 * Test the fixed reasoning service
 */

async function testFixedReasoning() {
    console.log('🧠 Testing Fixed Reasoning Service...\n');
    
    try {
        const reasoningPrompt = "Think through this step by step: If I have 3 apples and give away 1, how many do I have left? Show your reasoning process.";
        
        // Test reasoning with claude
        const reasoningUrl = `https://text.pollinations.ai/${encodeURIComponent(reasoningPrompt)}?model=claude&max_tokens=300&temperature=0.3`;
        
        console.log('Fetching reasoning from claude...');
        console.log('URL:', reasoningUrl);
        
        const response = await fetch(reasoningUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Pollinations-MCP-Reasoning/1.0'
            }
        });

        console.log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const reasoningText = await response.text();
        console.log('\n✅ Successfully fetched reasoning!');
        console.log('Reasoning text length:', reasoningText.length);
        console.log('Reasoning text:', reasoningText);

        // Test final answer generation
        const finalPrompt = `Based on the following reasoning, provide a concise final answer to the original question.

Original Question: If I have 3 apples and give away 1, how many do I have left?

Reasoning Process:
${reasoningText}

Final Answer:`;

        const finalUrl = `https://text.pollinations.ai/${encodeURIComponent(finalPrompt)}?model=openai&max_tokens=100&temperature=0.7`;
        
        console.log('\nFetching final answer...');
        const finalResponse = await fetch(finalUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Pollinations-MCP-Reasoning/1.0'
            }
        });

        if (!finalResponse.ok) {
            throw new Error(`Final API error: ${finalResponse.status} ${finalResponse.statusText}`);
        }

        const finalAnswer = await finalResponse.text();
        console.log('\n✅ Final answer:', finalAnswer);
        
        console.log('\n🎯 Reasoning chain test completed successfully!');
        console.log('\n📋 Summary:');
        console.log('- Reasoning model: claude');
        console.log('- Final model: openai');
        console.log('- Reasoning text length:', reasoningText.length);
        console.log('- Final answer length:', finalAnswer.length);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testFixedReasoning().catch(console.error);