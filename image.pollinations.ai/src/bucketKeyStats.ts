import Table from "cli-table3";
import debug from "debug";
import { generalImageQueue } from "./generalImageQueue";

const logStats = debug("pollinations:stats");

// Initialize an object to track images requested and returned per bucket key
export const bucketKeyStats = {};
export let requestTimestamps = []; // Array to store timestamps of image requests

export let imageReturnTimestamps = []; // Array to store timestamps of returned images

export const printQueueStatus = () => {
    requestTimestamps = requestTimestamps.filter(
        (timestamp) => Date.now() - timestamp < 60000,
    );
    imageReturnTimestamps = imageReturnTimestamps.filter(
        (timestamp) => Date.now() - timestamp < 60000,
    );

    const batchHead = ["Bucket Key", "Jobs", "Requests", "Returns"];
    const batchTable = new Table({
        head: batchHead,
        colWidths: [20, 10, 10, 10],
    });

    const imageHead = [
        "Requests",
        "Returned",
        "Q-Size",
        "Q-Pending",
        "Q-Utilization",
    ];
    const imageTable = new Table({
        head: imageHead,
        colWidths: [10, 10, 10, 10, 10],
    });

    currentJobs.forEach((batch) => {
        const bucketKeyStatsRow = bucketKeyStats[batch.bucketKey] || {
            requested: 0,
            returned: 0,
        };
        batchTable.push([
            batch.bucketKey,
            batch.jobs.length,
            bucketKeyStatsRow.requested,
            bucketKeyStatsRow.returned,
        ]);
    });

    const queueSize = generalImageQueue.size;
    const queuePending = generalImageQueue.pending;
    // const queueUtilization = ((queueSize + queuePending) / (2 * generalImageQueue.concurrency) * 100).toFixed(2);
    imageTable.push([
        requestTimestamps.length,
        imageReturnTimestamps.length,
        queueSize,
        queuePending,
        `N/I%`,
    ]);

    logStats(batchTable.toString());
    logStats(imageTable.toString());

    // construct simple string tables for file writing
    const _fileBatchTableHeaders = batchHead.join(",");
    const _fileBatchTable = batchTable.map((row) => row.join(",")).join("\n");
    const _fileImageTableHeaders = imageHead.join(",");
    const _fileImageTable = imageTable.map((row) => row.join(",")).join("\n");

    // Write tables to a file
    // writeFileSync('tableLogs.txt', `${fileBatchTableHeaders}\n${fileBatchTable}\n${fileImageTableHeaders}\n${fileImageTable}`);
};
const jobCounts = [];

export const countJobs = (average = false) => {
    const currentCount = currentJobs.reduce((acc, batch) => {
        if (batch.safeParams.model !== "flux") {
            return acc + batch.jobs.length;
        }
        return acc;
    }, 0);

    if (average) {
        jobCounts.push(currentCount);
        if (jobCounts.length > 5) {
            jobCounts.shift();
        }
        return Math.round(jobCounts.reduce((a, b) => a + b) / jobCounts.length);
    }
    return currentCount;
};
