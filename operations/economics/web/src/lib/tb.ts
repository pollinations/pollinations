import { FIXTURES } from "../fixtures";
import type {
    Data,
    OpCloudRow,
    OpPollenRow,
    OpRunwayRow,
    OpTransactionRow,
} from "../types";

export const fixturesMode = (): boolean =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("fixtures");

export class TbError extends Error {
    pipe: string;
    status: number;

    constructor(pipe: string, status: number) {
        super(`${pipe}: HTTP ${status}`);
        this.pipe = pipe;
        this.status = status;
    }
}

async function fetchPipe<T>(pipe: string): Promise<T[]> {
    if (fixturesMode()) {
        const rows = FIXTURES[pipe];
        if (!rows) throw new Error(`Missing fixture for pipe ${pipe}`);
        return rows as T[];
    }

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`);
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data?: T[] };
    if (!Array.isArray(body.data)) {
        throw new Error(`${pipe}: response has no data array`);
    }
    return body.data;
}

export async function loadAll(): Promise<Data> {
    // All four pipes are required contracts. A missing pipe (404) must surface
    // as an error, never render as plausible-but-empty economics data.
    const [opTransactions, opCloud, opPollen, opRunway] = await Promise.all([
        fetchPipe<OpTransactionRow>("op_transactions_api"),
        fetchPipe<OpCloudRow>("op_cloud_api"),
        fetchPipe<OpPollenRow>("op_pollen_api"),
        fetchPipe<OpRunwayRow>("op_runway_api"),
    ]);

    return { opTransactions, opCloud, opPollen, opRunway };
}
