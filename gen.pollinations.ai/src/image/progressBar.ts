export class ProgressManager {
    updateBar(_id: string, _progress: number, _step: string, _status: string) {}
    completeBar(_id: string, _status = "Complete") {}
    stop() {}
    startRequest(_id: string) {
        return this;
    }
    setProcessing(_id: string) {}
}

export const createProgressTracker = () => new ProgressManager();
export type ProgressTracker = ReturnType<typeof createProgressTracker>;
export default ProgressManager;
