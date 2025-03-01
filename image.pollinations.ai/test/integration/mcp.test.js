import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from "@modelcontextprotocol/sdk/client";
import http from 'http';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleMcpSSE, handleMcpMessage } from '../../src/mcpServer.js';

describe('MCP Server Integration', () => {
  let server;
  let client;
  const PORT = 16385;

  beforeAll(async () => {
    // Start test server
    server = http.createServer((req, res) => {
      const pathname = req.url;

      if (pathname === '/mcp/sse') {
        handleMcpSSE(req, res);
        return;
      }

      if (pathname === '/mcp/messages') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const message = JSON.parse(body);
            handleMcpMessage(message, res);
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON message' }));
          }
        });
        return;
      }
    });

    await new Promise(resolve => {
      server.listen(PORT, resolve);
    });

    // Create MCP client
    client = new Client({
      name: "test-client",
      version: "1.0.0"
    });

    await client.connect(`http://localhost:${PORT}/mcp`);
  });

  afterAll(async () => {
    await new Promise(resolve => {
      server.close(resolve);
    });
  });

  it('should list available models', async () => {
    const models = await client.readResource("models://list");
    expect(models).toBeDefined();
    expect(models.contents).toHaveLength(1);
    
    const modelsList = JSON.parse(models.contents[0].text);
    expect(modelsList).toBeInstanceOf(Array);
    expect(modelsList[0]).toHaveProperty('name');
    expect(modelsList[0]).toHaveProperty('type');
    expect(modelsList[0]).toHaveProperty('capabilities');
  });

  it('should get model capabilities', async () => {
    const capabilities = await client.readResource("capabilities://flux");
    expect(capabilities).toBeDefined();
    expect(capabilities.contents).toHaveLength(1);
    
    const modelCapabilities = JSON.parse(capabilities.contents[0].text);
    expect(modelCapabilities).toHaveProperty('type');
    expect(modelCapabilities).toHaveProperty('enhance');
    expect(modelCapabilities).toHaveProperty('maxSideLength');
    expect(modelCapabilities).toHaveProperty('supportedFeatures');
  });

  it('should generate an image', async () => {
    const result = await client.callTool({
      name: "generate-image",
      arguments: {
        prompt: "test image",
        model: "flux",
        width: 512,
        height: 512
      }
    });

    expect(result).toBeDefined();
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].data).toMatch(/^data:image\/(jpeg|png);base64,/);
    
    const metadata = JSON.parse(result.content[1].text);
    expect(metadata).toHaveProperty('metadata');
    expect(metadata.metadata).toHaveProperty('model');
    expect(metadata.metadata).toHaveProperty('inference_time_ms');
  });

  it('should use prompt template', async () => {
    const prompt = await client.getPrompt("create-image", {
      description: "test landscape",
      style: "digital art",
      mood: "peaceful"
    });

    expect(prompt).toBeDefined();
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0].role).toBe('user');
    expect(prompt.messages[0].content.type).toBe('text');
    expect(prompt.messages[0].content.text).toContain('test landscape');
    expect(prompt.messages[0].content.text).toContain('digital art');
    expect(prompt.messages[0].content.text).toContain('peaceful');
  });

  it('should handle invalid model errors', async () => {
    await expect(client.readResource("capabilities://invalid-model")).rejects.toThrow('Model not found');
  });

  it('should handle invalid tool parameters', async () => {
    await expect(client.callTool({
      name: "generate-image",
      arguments: {
        prompt: "",  // Empty prompt should fail validation
        model: "flux"
      }
    })).rejects.toThrow();
  });
});
