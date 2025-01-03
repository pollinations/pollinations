import express from 'express';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import HeartbeatRunner from '../utils/run_with_heartbeat.js';

describe('Heartbeat Integration Tests', () => {
    let masterServer;
    let registeredServers = [];
    const masterPort = 3001;
    const workerPort = 3002;

    beforeAll(async () => {
        // Setup mock master server
        const app = express();
        app.use(express.json());
        
        app.post('/register', (req, res) => {
            const { url, type } = req.body;
            registeredServers.push({ url, type, timestamp: Date.now() });
            res.json({ success: true });
        });

        masterServer = app.listen(masterPort);
    });

    afterAll(async () => {
        if (masterServer) {
            await new Promise(resolve => masterServer.close(resolve));
        }
    });

    beforeEach(() => {
        registeredServers = [];
    });

    it('should register worker with master server', async () => {
        // Setup mock worker service
        const workerApp = express();
        workerApp.get('/health', (req, res) => res.json({ status: 'ok' }));
        const workerServer = workerApp.listen(workerPort);

        // Create heartbeat runner
        const runner = new HeartbeatRunner(
            'test-type',
            workerPort,
            'node',
            ['-e', 'console.log("mock worker running")'],
            {
                heartbeatInterval: 1000, // 1 second for faster testing
                masterUrl: `http://localhost:${masterPort}/register`
            }
        );

        // Start heartbeat
        runner.start();

        // Wait for registration
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check registration
        expect(registeredServers.length).toBeGreaterThan(0);
        expect(registeredServers[0].type).toBe('test-type');
        expect(registeredServers[0].url).toContain(`:${workerPort}`);

        // Cleanup
        runner.stop();
        await new Promise(resolve => workerServer.close(resolve));
    });
});
