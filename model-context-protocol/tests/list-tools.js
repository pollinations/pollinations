#!/usr/bin/env node

/**
 * Test script to list all available tools in the Pollinations MCP server
 * 
 * This script uses fetch to directly call the MCP server's capabilities endpoint
 * following the "thin proxy" design principle.
 */

import fetch from 'node-fetch';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const SSE_URL = `${SERVER_URL}/sse`;
const MESSAGES_URL = `${SERVER_URL}/messages`;

// Function to list all available tools
async function listTools() {
  console.log('Listing all available tools in the Pollinations MCP server...');
  console.log(`Server URL: ${SERVER_URL}`);
  
  try {
    // First establish an SSE connection
    console.log('\nEstablishing SSE connection...');
    const sseResponse = await fetch(SSE_URL, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!sseResponse.ok) {
      throw new Error(`Failed to establish SSE connection: ${sseResponse.status} ${sseResponse.statusText}`);
    }
    
    console.log('SSE connection established');
    
    // Now send a capabilities request
    console.log('\nRequesting server capabilities...');
    const capabilitiesRequest = {
      type: 'capabilities'
    };
    
    const capabilitiesResponse = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(capabilitiesRequest)
    });
    
    if (!capabilitiesResponse.ok) {
      throw new Error(`Failed to get capabilities: ${capabilitiesResponse.status} ${capabilitiesResponse.statusText}`);
    }
    
    const capabilities = await capabilitiesResponse.json();
    
    if (capabilities && capabilities.capabilities && capabilities.capabilities.tools) {
      const tools = capabilities.capabilities.tools;
      const toolNames = Object.keys(tools);
      
      console.log(`\nFound ${toolNames.length} tools:`);
      
      if (toolNames.length === 0) {
        console.log('No tools found in server capabilities');
      } else {
        // Group tools by category
        const categories = {
          'Image Tools': toolNames.filter(name => name.toLowerCase().includes('image')),
          'Audio Tools': toolNames.filter(name => 
            name.toLowerCase().includes('audio') || 
            name.toLowerCase().includes('say')
          ),
          'Text Tools': toolNames.filter(name => name.toLowerCase().includes('text')),
          'Authentication Tools': toolNames.filter(name => 
            name.toLowerCase().includes('auth') || 
            name.toLowerCase().includes('token') || 
            name.toLowerCase().includes('referrer')
          ),
          'Utility Tools': toolNames.filter(name => 
            name.toLowerCase().includes('list') && 
            !name.toLowerCase().includes('image') && 
            !name.toLowerCase().includes('audio') && 
            !name.toLowerCase().includes('text')
          )
        };
        
        // Print tools by category
        for (const [category, categoryTools] of Object.entries(categories)) {
          if (categoryTools.length > 0) {
            console.log(`\n${category}:`);
            categoryTools.forEach(tool => {
              const schema = tools[tool];
              const params = Object.keys(schema || {}).join(', ');
              console.log(`  - ${tool}${params ? ` (params: ${params})` : ''}`);
            });
          }
        }
        
        // Print any uncategorized tools
        const categorizedTools = Object.values(categories).flat();
        const uncategorizedTools = toolNames.filter(tool => !categorizedTools.includes(tool));
        
        if (uncategorizedTools.length > 0) {
          console.log('\nOther Tools:');
          uncategorizedTools.forEach(tool => {
            const schema = tools[tool];
            const params = Object.keys(schema || {}).join(', ');
            console.log(`  - ${tool}${params ? ` (params: ${params})` : ''}`);
          });
        }
      }
    } else {
      console.log('No tools found in server capabilities');
    }
  } catch (error) {
    console.error('Error listing tools:', error);
  }
}

// Run the script
listTools().catch(console.error);
