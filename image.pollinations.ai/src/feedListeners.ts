import debug from "debug";
import { isMature } from "./utils/mature.ts";

const logFeed = debug("pollinations:feed");

const feedListeners: {
    res: WritableStreamDefaultWriter;
    isAuthenticated: boolean;
}[] = [];
const lastStates: unknown[] = [];

export type SendToListenersOptions = {
    saveAsLastState?: boolean;
};

export const sendToFeedListeners = (
    data: any,
    options: SendToListenersOptions = {},
) => {
    // Check if prompt contains mature content and flag it
    if (data?.prompt && !data?.isMature) {
        data.isMature = isMature(data.prompt);
    }

    if (options.saveAsLastState) {
        lastStates.push(data);
    }
    for (const listener of feedListeners) {
        sendToListener(listener.res, data, listener.isAuthenticated);
    }
};

function sendToListener(listener: any, data: any, isAuthenticated = false) {
    if (!isAuthenticated) {
        if (
            data?.private ||
            data?.nsfw ||
            data?.isChild ||
            data?.isMature ||
            data?.maturity?.nsfw ||
            data?.maturity?.isChild ||
            data?.maturity?.isMature ||
            (data?.prompt && isMature(data?.prompt))
        )
            return;
    }

    logFeed("data", isAuthenticated ? "[authenticated]" : "", data);
    return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}
