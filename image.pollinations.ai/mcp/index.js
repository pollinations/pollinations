import { startMcpServer } from './server.js';

const port = process.env.MCP_PORT || 16385;
startMcpServer(port);
