import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["src/index.js"]
});

const client = new Client(
  {
    name: "example-client",
    version: "1.0.0"
  }
);

await client.connect(transport);

// // List prompts
// const prompts = await client.listPrompts();
// console.log(prompts);

// // List resources
// const resources = await client.listResources();
// console.log(resources);

const tools = await client.listTools();
console.log(tools);
