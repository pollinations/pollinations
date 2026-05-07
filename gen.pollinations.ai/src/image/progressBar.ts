export class ProgressManager {
    createBar(_id: string, _title: string) {}
    updateBar(_id: string, _progress: number, _step: string, _status: string) {}
    completeBar(_id: string, _status = "Complete") {}
    errorBar(_id: string, _error: string) {}
    stop() {}
    startRequest(_id: string) {
        return this;
    }
    setProcessing(_id: string) {}
}

export const createProgressTracker = () => new ProgressManager();
export type ProgressTracker = ReturnType<typeof createProgressTracker>;
export default ProgressManager;
