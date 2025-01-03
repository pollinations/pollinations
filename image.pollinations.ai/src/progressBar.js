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
            format: ' {bar} | {title} | {step}: {status}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 20
        }, cliProgress.Presets.shades_classic);

        this.bars = new Map();
        this.startTimes = new Map();
    }

    createBar(id, title) {
        const bar = this.multibar.create(100, 0, {
            title,
            step: 'Starting',
            status: 'Initializing...'
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
        logTime(`${id} started`);
        return bar;
    }

    updateBar(id, progress, step, status) {
        const bar = this.bars.get(id);
        if (bar) {
            bar.update(progress, { step, status });
            logProgress(`${id}: ${progress}% - ${step} - ${status}`);
        }
    }

    completeBar(id, status = 'Complete') {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = `${status} (${duration.toFixed(2)}s)`;
            
            bar.update(100, { step: 'Done', status: finalStatus });
            logProgress(`${id}: Complete - ${finalStatus}`);
            logTime(`${id} completed in ${duration.toFixed(2)}s`);
            
            this.bars.delete(id);
            this.startTimes.delete(id);
        }
    }

    errorBar(id, error) {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = colors.red(`Error: ${error} (${duration.toFixed(2)}s)`);
            
            bar.update(100, { step: 'Error', status: finalStatus });
            logProgress(`${id}: Error - ${error}`);
            logTime(`${id} failed after ${duration.toFixed(2)}s: ${error}`);
            
            this.bars.delete(id);
            this.startTimes.delete(id);
        }
    }

    stop() {
        this.multibar.stop();
    }

    setQueued(id, position) {
        this.updateBar(id, 0, 'Queue', `Position: ${position}`);
    }

    setProcessing(id) {
        this.updateBar(id, 10, 'Processing', 'Started');
    }
}

export const createProgressTracker = () => {
    const progress = new ProgressManager();
    
    return {
        startRequest: (requestId) => {
            progress.createBar(requestId, `Request ${requestId}`);
            return progress;
        }
    };
};

export default ProgressManager;
