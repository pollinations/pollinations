import PQueue from 'p-queue';
import { countFluxJobs } from "./availableServers.js";

export const BATCH_SIZE = 1; // Number of requests per batch

export const concurrency = 15; // Number of concurrent requests

export const generalImageQueue = new PQueue({ concurrency });

export const countJobs = countFluxJobs;
