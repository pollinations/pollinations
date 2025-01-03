import cliProgress from 'cli-progress';
import colors from 'ansi-colors';
import debug from 'debug';

const logProgress = debug('pollinations:progress');
const logTime = debug('pollinations:time');

// Define a set of distinct colors for the progress bars
const progressColors = [
    colors.cyan,
    colors.green,
    colors.yellow,
    colors.blue,
    colors.magenta,
    colors.red
];

// Simple hash function to get consistent color for each ID
function getColorForId(id) {
    const hash = id.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return progressColors[Math.abs(hash) % progressColors.length];
}

class ProgressManager {
    constructor() {
        this.multibar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            format: (options, params, payload) => {
                const color = getColorForId(payload.id);
                const completedLength = Math.round((params.value / params.total) * options.barsize);
                const bar = options.barCompleteChar.repeat(completedLength) + 
                           options.barIncompleteChar.repeat(options.barsize - completedLength);
                
                // Check if anything has changed
                const lastStep = this.lastSteps.get(payload.id);
                const lastValue = this.lastValues.get(payload.id);
                const hasChanged = lastStep !== payload.step || lastValue !== params.value;
                
                // Only show time if step has changed
                const timeStr = (lastStep !== payload.step) ? 
                    ` (${((Date.now() - this.startTimes.get(payload.id)) / 1000).toFixed(2)}s)` : '';
                
                if (hasChanged) {
                    this.lastSteps.set(payload.id, payload.step);
                    this.lastValues.set(payload.id, params.value);
                    return color(` ${bar} | ${payload.title} | ${payload.step}: ${payload.status}${timeStr}\n`);
                }
                return ''; // Return empty string if nothing changed
            },
            barsize: 20,
            noTTYOutput: true,
            notTTYSchedule: 100
        }, cliProgress.Presets.shades_classic);

        this.bars = new Map();
        this.startTimes = new Map();
        this.lastSteps = new Map();
        this.lastValues = new Map();
    }

    createBar(id, title) {
        const bar = this.multibar.create(100, 0, {
            id,
            title,
            step: 'Starting',
            status: 'Initializing...'
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
        this.lastSteps.set(id, null);
        this.lastValues.set(id, null);
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
            const finalStatus = `Image generation complete (${duration.toFixed(2)}s)`;
            
            bar.update(100, { step: 'Done', status: finalStatus });
            logProgress(`${id}: Complete - ${finalStatus}`);
            
            this.lastSteps.delete(id);
            this.lastValues.delete(id);
            this.startTimes.delete(id);
            this.bars.delete(id);
        }
    }

    errorBar(id, error) {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = `Error: ${error} (${duration.toFixed(2)}s)`;
            
            bar.update(100, { step: 'Error', status: finalStatus });
            logProgress(`${id}: Error - ${finalStatus}`);
            
            this.lastSteps.delete(id);
            this.lastValues.delete(id);
            this.startTimes.delete(id);
            this.bars.delete(id);
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
