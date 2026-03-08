// No-op progress tracker — real progress bars are incompatible with Workers.

export class ProgressManager {
    createBar(_id: string, _title: string) {}
    updateBar(_id: string, _progress: number, _step: string, _status: string) {}
    completeBar(_id: string, _status = "Complete") {}
    errorBar(_id: string, _error: string) {}
    stop() {}
    setProcessing(_id: string) {}
}

export default ProgressManager;
