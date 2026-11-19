export interface InterruptionController {
    cancelResponse(): { type: "response.cancel" };
    isInterrupted(): boolean;
    markInterrupted(value: boolean): void;
}

export function createInterruptionController(): InterruptionController {
    let interrupted = false;
    return {
        cancelResponse() {
            interrupted = true;
            return { type: "response.cancel" };
        },
        isInterrupted() {
            return interrupted;
        },
        markInterrupted(value: boolean) {
            interrupted = value;
        },
    };
}

export function handleBargeIn(
    controller: InterruptionController,
    onInterrupt?: () => void,
): { type: "response.cancel" } {
    const msg = controller.cancelResponse();
    onInterrupt?.();
    return msg;
}

export function shouldCancelOnInputAudio(): boolean {
    return true;
}
