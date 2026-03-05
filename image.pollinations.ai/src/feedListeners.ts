// Feed functionality removed — incompatible with Workers.

export type SendToListenersOptions = {
    saveAsLastState?: boolean;
};

export const sendToFeedListeners = (
    _data: any,
    _options: SendToListenersOptions = {},
) => {
    // no-op
};
