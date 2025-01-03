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
        this.stepTimes = new Map(); // Track time spent in each step
    }

    createBar(id, title, initialStatus = 'Starting...') {
        const bar = this.multibar.create(100, 0, { 
            title: title,
            status: initialStatus
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
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
        logTime(`${id} started`);
        return bar;
    }

    updateBar(id, progress, status) {
        let bar = this.bars.get(id);
        if (!bar) {
            // If the bar doesn't exist yet, create it and record start time
            const [stepType, requestId] = id.split('-');
            const title = stepType.charAt(0).toUpperCase() + stepType.slice(1).replace(/([A-Z])/g, ' $1');
            bar = this.createSubBar(id, `main-${requestId}`, title, status);
            this.stepTimes.set(id, { start: Date.now() });
        }
        bar.update(progress, { status });
        logProgress(`${id}: ${progress}% - ${status}`);
    }

    completeBar(id, status = 'Complete') {
        const bar = this.bars.get(id);
        if (bar) {
            const stepTime = this.stepTimes.get(id);
            const duration = stepTime ? Date.now() - stepTime.start : 0;
            const durationStr = (duration / 1000).toFixed(2);
            
            const finalStatus = `${status} (${durationStr}s)`;
            bar.update(100, { status: finalStatus });
            logProgress(`${id}: Complete - ${status}`);
            logTime(`${id} completed in ${durationStr}s`);

            // Store completion time
            if (stepTime) {
                stepTime.end = Date.now();
                stepTime.duration = duration;
            }

            // Remove sub-bars after completion
            if (!id.includes('main')) {
                this.multibar.remove(bar);
                this.bars.delete(id);
                this.startTimes.delete(id);
            }
        }
    }

    errorBar(id, error) {
        const bar = this.bars.get(id);
        if (bar) {
            const stepTime = this.stepTimes.get(id);
            const duration = stepTime ? Date.now() - stepTime.start : 0;
            const durationStr = (duration / 1000).toFixed(2);
            
            const finalStatus = colors.red(`Error: ${error} (${durationStr}s)`);
            bar.update(100, { status: finalStatus });
            logProgress(`${id}: Error - ${error}`);
            logTime(`${id} failed after ${durationStr}s: ${error}`);
        }
    }

    stop() {
        const mainStart = this.startTimes.get('main');
        if (mainStart) {
            const totalDuration = (Date.now() - mainStart) / 1000;
            logTime(`Total execution time: ${totalDuration.toFixed(2)}s`);

            // Log all step times
            for (const [id, times] of this.stepTimes.entries()) {
                if (times.end) {
                    const stepDuration = (times.duration / 1000).toFixed(2);
                    logTime(`Step ${id}: ${stepDuration}s`);
                }
            }
        }

        // Remove all sub-bars
        for (const [id, bar] of this.bars.entries()) {
            if (!id.includes('main')) {
                this.multibar.remove(bar);
            }
        }
        
        this.multibar.stop();
    }

    setQueued(position) {
        this.updateBar('main', 0, `Queued (position: ${position})`);
        this.updateBar('queue', 50, `Queue position: ${position}`);
    }

    setProcessing() {
        this.updateBar('main', 10, 'Processing started');
        this.completeBar('queue', 'Processing started');
    }
}

export const createProgressTracker = () => {
    const progress = new ProgressManager();
    
    return {
        startRequest: (requestId) => {
            const mainBar = progress.createBar(`main-${requestId}`, `Request ${requestId}`, 'Initializing...');
            progress.updateBar(`queue-${requestId}`, 0, 'Checking queue status...');
            return progress;
        }
    };
};

export default ProgressManager;
