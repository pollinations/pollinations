#!/usr/bin/env node

/**
 * Test the enhanced reasoning service via the MCP server
 * Tests the actual fetch implementation
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPReasoning() {
    console.log('🧠 Testing Enhanced Reasoning Service via MCP...\n');
    
    const mcpProcess = spawn('node', ['src/index.js'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    mcpProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log('MCP Output:', data.toString().trim());
    });

    mcpProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('MCP Error:', data.toString().trim());
    });

    mcpProcess.on('close', (code) => {
        console.log(`\nMCP process exited with code ${code}`);
        if (code === 0) {
            console.log('✅ MCP server started successfully');
        } else {
            console.error('❌ MCP server failed to start');
        }
    });

    // Wait a moment for the server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test the reasoning service
    const testRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'deepReasoning',
            arguments: {
                prompt: "What is 2 + 2?",
                reasoningModel: "deepseek-r1",
                maxReasoningTokens: 100,
                maxFinalTokens: 50
            }
        }
    }) + '\n';

    console.log('Sending test request...');
    mcpProcess.stdin.write(testRequest);

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Kill the process
    mcpProcess.kill();

    console.log('\n🎯 Test completed!');
}

// Run the test
testMCPReasoning().catch(console.error);