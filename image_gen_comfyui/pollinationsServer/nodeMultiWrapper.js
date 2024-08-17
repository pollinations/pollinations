import { spawn } from 'child_process';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';

const numServers = process.argv[2] ? parseInt(process.argv[2]) : 3;
const basePort = 5003;
const servers = [];

// Start the servers on different ports
for (let i = 0; i < numServers; i++) {
    const port = basePort + i;
    const server = spawn('python3', ['server.py'], { env: { ...process.env, PORT: port.toString() } });
    servers.push({ port, process: server });

    server.stdout.on('data', (data) => {
        console.log(`Server ${i} stdout: ${data}`);
    });

    server.stderr.on('data', (data) => {
        console.error(`Server ${i} stderr: ${data}`);
    });

    server.on('close', (code) => {
        console.log(`Server ${i} exited with code ${code}`);
    });

    console.log(`Started server ${i} on port ${port}`);
}

// Create a simple round-robin load balancer
let currentServer = 0;

const proxy = createProxyMiddleware({
    target: `http://localhost:${basePort}`,
    changeOrigin: true,
    router: (req) => {
        const target = `http://localhost:${servers[currentServer].port}`;
        console.log(`Routing request to server on port ${servers[currentServer].port}`);
        currentServer = (currentServer + 1) % numServers;
        return target;
    }
});

// Create the main server to listen on port 5002 and distribute requests
const server = http.createServer((req, res) => {
    console.log(`Received request for ${req.url}`);
    proxy(req, res, (err) => {
        if (err) {
            console.error(`Error handling request for ${req.url}: ${err.message}`);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Something went wrong.');
        } else {
            console.log(`Successfully handled request for ${req.url}`);
        }
    });
});

server.listen(5002, () => {
    console.log('Load balancer listening on port 5002');
});

// Cleanup function to kill all child processes
function cleanup() {
    console.log('Cleaning up...');
    servers.forEach(({ process }) => {
        process.kill();
    });
    process.exit();
}

// Handle exit events
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup();
});
