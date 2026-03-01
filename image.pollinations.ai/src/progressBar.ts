import colors, { type StyleFunction } from "ansi-colors";
import { type Bar, MultiBar, Presets } from "cli-progress";
import debug from "debug";

const logProgress = debug("pollinations:progress");
const logTime = debug("pollinations:time");

// Define a set of distinct colors for the progress bars
const progressColors = [
    colors.cyan,
    colors.green,
    colors.yellow,
    colors.blue,
    colors.magenta,
    colors.red,
];

// Simple hash function to get consistent color for each ID
function getColorForId(id: string | undefined): StyleFunction {
    if (!id) return progressColors[0]; // Default color if id is undefined
    const hash = id.split("").reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return progressColors[Math.abs(hash) % progressColors.length];
}

export class ProgressManager {
    multibar: MultiBar;
    bars: Map<string, Bar>;
    startTimes: Map<string, number>;

    constructor() {
        this.multibar = new MultiBar(
            {
                clearOnComplete: false,
                hideCursor: true,
                format: (options, params, payload) => {
                    const color = getColorForId(payload.id);
                    const completedLength = Math.round(
                        (params.value / params.total) * options.barsize,
                    );
                    const bar =
                        options.barCompleteChar.repeat(completedLength) +
                        options.barIncompleteChar.repeat(
                            options.barsize - completedLength,
                        );
                    return color(
                        ` ${bar} | ${payload.title} | ${payload.step}: ${payload.status}\n`,
                    );
                },
                barsize: 20,
                noTTYOutput: false,
                notTTYSchedule: 100,
            },
            Presets.shades_classic,
        );

        this.bars = new Map();
        this.startTimes = new Map();
    }

    createBar(id: string, title: string) {
        const bar = this.multibar.create(100, 0, {
            id,
            title,
            step: "Starting",
            status: "Initializing...",
        });
        this.bars.set(id, bar);
        this.startTimes.set(id, Date.now());
        logTime(`${id} started`);
        return bar;
    }

    updateBar(id: string, progress: number, step: string, status: string) {
        const bar = this.bars.get(id);
        if (bar) {
            bar.update(progress, { step, status });
            logProgress(`${id}: ${progress}% - ${step} - ${status}`);
        }
    }

    completeBar(id: string, status: string = "Complete") {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = `${status} (${duration.toFixed(2)}s)`;

            bar.update(100, { step: "Done", status: finalStatus });
            logProgress(`${id}: Complete - ${finalStatus}`);
            logTime(`${id} completed in ${duration.toFixed(2)}s`);

            this.bars.delete(id);
            this.startTimes.delete(id);
        }
    }

    errorBar(id: string, error: string) {
        const bar = this.bars.get(id);
        if (bar) {
            const startTime = this.startTimes.get(id);
            const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
            const finalStatus = colors.red(
                `Error: ${error} (${duration.toFixed(2)}s)`,
            );

            bar.update(100, { step: "Error", status: finalStatus });
            logProgress(`${id}: Error - ${error}`);
            logTime(`${id} failed after ${duration.toFixed(2)}s: ${error}`);

            this.bars.delete(id);
            this.startTimes.delete(id);
        }
    }

    stop() {
        this.multibar.stop();
    }

    setProcessing(id: string) {
        this.updateBar(id, 10, "Processing", "Started");
    }
}

export const createProgressTracker = () => {
    const progress = new ProgressManager();

    return {
        startRequest: (requestId: string) => {
            progress.createBar(requestId, `${requestId}`);
            return progress;
        },
    };
};

export type ProgressTracker = ReturnType<typeof createProgressTracker>;

export default ProgressManager;
