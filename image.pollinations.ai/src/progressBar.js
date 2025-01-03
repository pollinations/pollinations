import cliProgress from 'cli-progress';
import colors from 'ansi-colors';
import debug from 'debug';

const logProgress = debug('pollinations:progress');
const logTime = debug('pollinations:time');

class ProgressManager {
    constructor() {
        this.multibar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            format: ' {title} |' + colors.cyan('{bar}') + '| {percentage}% » {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 15,
            formatValue: (v, options, type) => {
                if (type === 'title') {
                    return v.padEnd(25);
                }
                if (type === 'status') {
                    return v.padEnd(35);
                }
                return v;
            },
            autopadding: true,
            linewrap: false,
            synchronousUpdate: true
        }, cliProgress.Presets.shades_classic);

        this.bars = new Map();
        this.startTimes = new Map();
        this.barOrder = [];
        this.stepOrder = [
            'queue',
            'prompt',
            'server',
            'generation',
            'processing',
            'safety',
            'cache'
        ];
    }

    createBar(id, title, initialStatus = 'Starting...') {
        const bar = this.multibar.create(100, 0, { 
            title: title,
            status: initialStatus
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
        this.barOrder.push(id);
        logTime(`${id} started`);
        return bar;
    }

    createSubBar(id, parentId, title, initialStatus = 'Waiting...') {
        const bar = this.multibar.create(100, 0, {
            title: `  ↳ ${title}`,
            status: initialStatus
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
        this.barOrder.push(id);
        logTime(`${id} started`);
        return bar;
    }

    updateBar(id, progress, status) {
        const bar = this.bars.get(id);
        if (bar) {
            bar.update(progress, { status });
            logProgress(`${id}: ${progress}% - ${status}`);
        }
    }

    completeBar(id, status = 'Complete') {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = Date.now() - startTime;
            const durationStr = (duration / 1000).toFixed(2);
            
            const finalStatus = `${status} (${durationStr}s)`;
            bar.update(100, { status: finalStatus });
            logProgress(`${id}: Complete - ${status}`);
            logTime(`${id} completed in ${durationStr}s`);

            // Remove sub-bars after completion
            if (!id.includes('main')) {
                this.multibar.remove(bar);
                this.bars.delete(id);
                this.barOrder = this.barOrder.filter(b => b !== id);
            }
        }
    }

    errorBar(id, error) {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = Date.now() - startTime;
            const durationStr = (duration / 1000).toFixed(2);
            
            const finalStatus = colors.red(`Error: ${error} (${durationStr}s)`);
            bar.update(100, { status: finalStatus });
            logProgress(`${id}: Error - ${error}`);
            logTime(`${id} failed after ${durationStr}s: ${error}`);
        }
    }

    stop() {
        const totalStart = this.startTimes.get('main');
        if (totalStart) {
            const totalDuration = (Date.now() - totalStart) / 1000;
            logTime(`Total execution time: ${totalDuration.toFixed(2)}s`);
        }

        // Remove all sub-bars
        for (const id of this.barOrder) {
            if (!id.includes('main')) {
                const bar = this.bars.get(id);
                if (bar) {
                    this.multibar.remove(bar);
                }
            }
        }
        
        this.multibar.stop();
    }

    setQueued(position) {
        // Update queue status first
        this.updateBar('queue', 50, `Queue position: ${position}`);
        this.updateBar('main', 0, `Queued (position: ${position})`);
        
        // Reset all other bars to waiting
        for (const step of this.stepOrder.slice(1)) {
            this.updateBar(step, 0, 'Waiting for queue...');
        }
    }

    setProcessing() {
        // Complete queue bar and update main status
        this.completeBar('queue', 'Processing started');
        this.updateBar('main', 10, 'Processing started');
        
        // Reset all other bars to waiting
        for (const step of this.stepOrder.slice(1)) {
            this.updateBar(step, 0, 'Waiting...');
        }
    }
}

// Create a progress tracker specifically for image generation flow
export const createProgressTracker = () => {
    const progress = new ProgressManager();
    
    return {
        startRequest: (requestId) => {
            const mainBar = progress.createBar(`main-${requestId}`, `Request ${requestId}`, 'Initializing...');
            
            // Create sub-bars in specific order
            progress.createSubBar(`queue-${requestId}`, `main-${requestId}`, 'Queue Status', 'Checking queue...');
            progress.createSubBar(`prompt-${requestId}`, `main-${requestId}`, 'Prompt Processing', 'Waiting...');
            progress.createSubBar(`server-${requestId}`, `main-${requestId}`, 'Server Selection', 'Waiting...');
            progress.createSubBar(`generation-${requestId}`, `main-${requestId}`, 'Image Creation', 'Waiting...');
            progress.createSubBar(`processing-${requestId}`, `main-${requestId}`, 'Post-processing', 'Waiting...');
            progress.createSubBar(`safety-${requestId}`, `main-${requestId}`, 'Safety Check', 'Waiting...');
            progress.createSubBar(`cache-${requestId}`, `main-${requestId}`, 'Cache & Feed', 'Waiting...');
            
            // Start with queue check
            progress.updateBar(`queue-${requestId}`, 0, 'Checking queue status...');
            
            return progress;
        }
    };
};

export default ProgressManager;
