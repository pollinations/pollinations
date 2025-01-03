import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';
import debug from 'debug';

const logProgress = debug('pollinations:progress');
const logTime = debug('pollinations:time');

class ProgressManager {
    constructor() {
        this.mpb = new MultiProgressBars({
            anchor: 'top',
            border: true,
            persist: true,
        });
        
        this.bars = new Map();
        this.startTimes = new Map();
    }

    createBar(id, title) {
        this.mpb.addTask(id, {
            type: 'percentage',
            message: 'Initializing...',
            barTransformFn: chalk.cyan,
            nameTransformFn: chalk.bold,
            percentage: 0
        });
        this.bars.set(id, title);
        this.startTimes.set(id, Date.now());
        logTime(`${id} started`);
        return id;
    }

    updateBar(id, progress, step, status) {
        if (this.bars.has(id)) {
            this.mpb.updateTask(id, {
                percentage: progress / 100,
                message: `${step}: ${status}`
            });
            logProgress(`${id}: ${progress}% - ${step} - ${status}`);
        }
    }

    completeBar(id, status = 'Complete') {
        if (this.bars.has(id)) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = `${status} (${duration.toFixed(2)}s)`;
            
            this.mpb.done(id, { message: finalStatus });
            this.bars.delete(id);
            this.startTimes.delete(id);
            logTime(`${id} completed in ${duration.toFixed(2)}s`);
        }
    }

    errorBar(id, error) {
        if (this.bars.has(id)) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = chalk.red(`Error: ${error} (${duration.toFixed(2)}s)`);
            
            this.mpb.done(id, { message: finalStatus });
            this.bars.delete(id);
            this.startTimes.delete(id);
            logTime(`${id} failed after ${duration.toFixed(2)}s: ${error}`);
        }
    }

    stop() {
        // Clean up all remaining bars
        for (const [id] of this.bars) {
            this.completeBar(id, 'Stopped');
        }
    }

    setQueued(id, position) {
        this.updateBar(id, 0, 'Queue', `Position: ${position}`);
    }

    setProcessing(id) {
        this.updateBar(id, 10, 'Processing', 'Started');
    }
}

function createProgressTracker() {
    const progress = new ProgressManager();
    
    return {
        startRequest: (requestId) => {
            progress.createBar(requestId, `Request ${requestId}`);
            return progress;
        }
    };
}

export { createProgressTracker };
export default ProgressManager;
