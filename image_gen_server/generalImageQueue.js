import PQueue from 'p-queue';

export const BATCH_SIZE = 4; // Number of requests per batch

export const concurrency = 2; // Number of concurrent requests per bucket key

export const generalImageQueue = new PQueue({ concurrency });
