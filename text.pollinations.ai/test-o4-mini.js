#!/usr/bin/env node

import fetch from 'node-fetch';

const API_NAVY_ENDPOINT = "https://api.navy/v1";
const APINAVY_API_KEY = "sk-navy-347626579423965784375";

async function testO4Mini() {
    console.log("Testing o4-mini model on api.navy...\n");
    
    try {
        const response = await fetch(`${API_NAVY_ENDPOINT}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${APINAVY_API_KEY}`
            },
            body: JSON.stringify({
                model: "o4-mini",
                messages: [
                    {
                        role: "user",
                        content: "What is 2+2? Please show your reasoning step by step."
                    }
                ],
                max_tokens: 300
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✅ SUCCESS: o4-mini model is working!");
            console.log("\nResponse:");
            console.log(`Model: ${data.model}`);
            console.log(`Content: ${data.choices[0].message.content}`);
            console.log(`Reasoning tokens: ${data.usage.completion_tokens_details?.reasoning_tokens || 0}`);
            console.log(`Total tokens: ${data.usage.total_tokens}`);
        } else {
            console.log("❌ ERROR:", data);
        }
    } catch (error) {
        console.log("❌ NETWORK ERROR:", error.message);
    }
}

testO4Mini();
