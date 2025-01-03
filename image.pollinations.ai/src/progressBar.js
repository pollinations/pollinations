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
                const completedLength = Math.round(params.progress / 100 * options.barsize);
                const bar = options.barCompleteChar.repeat(completedLength) + 
                           options.barIncompleteChar.repeat(options.barsize - completedLength);
                return color(` ${bar} | ${payload.title} | ${payload.step}: ${payload.status}\n`);
            },
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 20,
            noTTYOutput: true,
            notTTYSchedule: 100
        }, cliProgress.Presets.shades_classic);

        this.bars = new Map();
        this.startTimes = new Map();
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
