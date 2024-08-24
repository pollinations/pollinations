import PQueue from 'p-queue';

export const BATCH_SIZE = 1; // Number of requests per batch

export const concurrency = 10; // Number of concurrent requests

export const generalImageQueue = new PQueue({ concurrency });

export const countJobs = () => {
    return generalImageQueue.size + generalImageQueue.pending;
};
