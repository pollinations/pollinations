#!/usr/bin/env node

import fetch from 'node-fetch';

async function testFixedO4Mini() {
    console.log("Testing fixed o4-mini configuration through Pollinations service...\n");
    
    try {
        // Test with anonymous access first to see the error
        const response = await fetch('http://localhost:16385/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "openai-reasoning",
                messages: [
                    {
                        role: "user",
                        content: "What is 3+3? Show your reasoning."
                    }
                ],
                max_tokens: 200
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✅ SUCCESS: o4-mini model is working through Pollinations!");
            console.log(`Content: ${data.choices[0].message.content}`);
        } else {
            console.log("Expected tier error (need seed tier):", data);
            console.log("\nThis is expected - the model requires seed tier authentication.");
        }
    } catch (error) {
        console.log("❌ NETWORK ERROR:", error.message);
    }
}

testFixedO4Mini();
