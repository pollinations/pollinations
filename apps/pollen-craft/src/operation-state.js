export function createMergeOperationRegistry() {
    let epoch = 0;
    const active = new Map();
    const claims = new Map();
    const pairs = new Map();

    const isCurrent = (operation) =>
        active.get(operation.id) === operation &&
        operation.epoch === epoch &&
        !operation.cancelled;

    const release = (operation, preserveSources = false) => {
        const sourceIds = [...(operation.sourceIds ?? [])];
        active.delete(operation.id);
        if (pairs.get(operation.pairKey) === operation)
            pairs.delete(operation.pairKey);
        for (const sourceId of sourceIds)
            if (claims.get(sourceId) === operation) claims.delete(sourceId);
        operation.sourceIds = preserveSources ? sourceIds : [];
        return sourceIds;
    };

    return {
        begin(operation) {
            if (operation.cancelled) return false;
            const existingPair = pairs.get(operation.pairKey);
            if (existingPair && isCurrent(existingPair)) return false;
            const sourceIds = [...new Set(operation.sourceIds ?? [])];
            if (
                sourceIds.some((sourceId) => {
                    const owner = claims.get(sourceId);
                    return owner && isCurrent(owner);
                })
            )
                return false;
            operation.epoch = epoch;
            operation.sourceIds = sourceIds;
            active.set(operation.id, operation);
            pairs.set(operation.pairKey, operation);
            for (const sourceId of sourceIds) claims.set(sourceId, operation);
            return true;
        },
        get(id) {
            return active.get(id) ?? null;
        },
        getByPair(pairKey) {
            return pairs.get(pairKey) ?? null;
        },
        values() {
            return [...active.values()];
        },
        isCurrent,
        isClaimed(sourceId) {
            const owner = claims.get(sourceId);
            return Boolean(owner && isCurrent(owner));
        },
        finish(operation, { preserveSources = false } = {}) {
            return release(operation, preserveSources);
        },
        cancel(operation) {
            if (!active.has(operation.id)) return false;
            operation.cancelled = true;
            release(operation);
            return true;
        },
        cancelAll() {
            const operations = [...active.values()];
            for (const operation of operations) {
                operation.cancelled = true;
                release(operation);
            }
            return operations;
        },
        invalidate() {
            epoch += 1;
            for (const operation of active.values()) operation.cancelled = true;
            active.clear();
            claims.clear();
            pairs.clear();
        },
        get size() {
            return active.size;
        },
    };
}

export function createPopoverBinding() {
    let token = 0;
    let binding = null;

    return {
        bind({ kind, pairKey = null, operationId = null }) {
            binding = {
                kind,
                pairKey,
                operationId,
                token: ++token,
            };
            return binding;
        },
        matches({
            token: expectedToken = null,
            pairKey = null,
            operationId = null,
        } = {}) {
            if (!binding) return false;
            if (expectedToken !== null && binding.token !== expectedToken)
                return false;
            if (pairKey !== null && binding.pairKey !== pairKey) return false;
            if (operationId !== null && binding.operationId !== operationId)
                return false;
            return true;
        },
        clear() {
            binding = null;
        },
        get current() {
            return binding;
        },
    };
}
