import fetch from 'node-fetch';
import { spawn } from 'child_process';
import debug from 'debug';

const log = debug('pollinations:heartbeat');

class HeartbeatRunner {
    constructor(type, port, command, args = [], options = {}) {
        this.type = type;
        this.port = port;
        this.command = command;
        this.args = args;
        this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
        this.masterUrl = options.masterUrl || 'https://image.pollinations.ai/register';
        this.process = null;
        this.heartbeatTimer = null;
        this.host = options.host || 'localhost';
    }

    async sendHeartbeat() {
        try {
            const url = `http://${this.host}:${this.port}`;
            const response = await fetch(this.masterUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, type: this.type })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            log(`Heartbeat sent successfully. URL: ${url} Type: ${this.type}`);
        } catch (error) {
            log('Failed to send heartbeat:', error);
        }
    }

    start() {
        // Start the command
        this.process = spawn(this.command, this.args, {
            stdio: 'inherit'
        });

        this.process.on('error', (error) => {
            log(`Failed to start command: ${error}`);
            this.stop();
        });

        this.process.on('exit', (code) => {
            log(`Command exited with code ${code}`);
            this.stop();
        });

        // Start heartbeat
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
        this.sendHeartbeat(); // Send first heartbeat immediately
    }

    stop() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

// CLI interface
if (process.argv[1] === import.meta.url) {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error('Usage: node run_with_heartbeat.js <type> <port> <command> [args...]');
        process.exit(1);
    }

    const [type, port, command, ...commandArgs] = args;
    const options = {
        heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
        masterUrl: process.env.POLLINATIONS_MASTER_URL,
        host: process.env.POLLINATIONS_HOST || 'localhost'
    };

    const runner = new HeartbeatRunner(type, port, command, commandArgs, options);
    runner.start();

    // Handle process termination
    process.on('SIGINT', () => runner.stop());
    process.on('SIGTERM', () => runner.stop());
}

export default HeartbeatRunner;
