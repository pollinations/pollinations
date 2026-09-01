import {
    ApiError,
    createApiClient,
    DEFAULT_TEXT_MODEL,
    isTextModel,
    TEXT_MODELS,
} from "./api.js";
import {
    canonicalPair,
    createInitialState,
    displayNameKey,
    findDiscovery,
    gameReducer,
    inventoryItems,
    LEGACY_STORAGE_KEY,
    loadState,
    rectanglesOverlap,
    resolveInventoryItem,
    SEEDS,
    STORAGE_KEY,
    saveState,
} from "./game.js";
import { createImageCache } from "./image-cache.js";
import { createMergeAnimation, visualMidpoint } from "./merge-animation.js";
import {
    createOAuthClient,
    initializeOAuthStorage,
    OAuthError,
} from "./oauth.js";
import {
    createMergeOperationRegistry,
    createPopoverBinding,
} from "./operation-state.js";

const localStore = safeStorage("localStorage");
const tabStore = safeStorage("sessionStorage");
initializeOAuthStorage(tabStore);
const api = createApiClient();
const canvas = document.querySelector("#crafting-canvas");
const canvasItems = document.querySelector("#canvas-items");
const mergeLayer = document.querySelector("#merge-layer");
const inventory = document.querySelector("#inventory-chips");
const search = document.querySelector("#inventory-search");
const resultPopover = document.querySelector("#result-popover");
const resultContent = document.querySelector("#result-content");
const resultLabel = document.querySelector("#result-label");
const retryText = document.querySelector("#retry-text");
const retryImage = document.querySelector("#retry-image");
const live = document.querySelector("#live-region");
const keyStatus = document.querySelector("#key-status");
const connectButton = document.querySelector("#connect-wallet");
const disconnectButton = document.querySelector("#disconnect-wallet");
const modelSelect = document.querySelector("#text-model");
const settingsDialog = document.querySelector("#settings-dialog");
const helpDialog = document.querySelector("#help-dialog");
const resetButton = document.querySelector("#reset-game");
const IMAGE_DECODE_TIMEOUT_MS = 15_000;
const MAX_CANVAS_INSTANCES = 80;
const TEXT_MODEL_STORAGE_KEY = "pollen-craft:text-model:v2";
const oauth = createOAuthClient({
    storage: tabStore,
    getLocation: () => globalThis.location,
    getHistory: () => globalThis.history,
    fetchImpl: globalThis.fetch,
    cryptoImpl: globalThis.crypto,
});
let state = loadState(localStore);
let selected = [];
let instances = new Map();
let drag = null;
let inventoryDrag = null;
let suppressInventoryClick = false;
let suppressInventoryChip = null;
let inventoryClickReset = null;
let authBusy = false;
let authStatusMessage = "";
let resetVersion = 0;
let activeImagePair = null;
let activeDiscovery = null;
let activePopoverImage = null;
let resultAnchor = null;
let focusedPair = null;
let focusedInstanceId = null;
let resultReturnFocus = null;
let resultReturnInstanceId = null;
let activeCombination = null;
let activeImageOperation = null;
const popoverBinding = createPopoverBinding();
const imageOperations = new Map();
const combinationOperations = createMergeOperationRegistry();
const mergeAnimation = createMergeAnimation({
    canvas,
    layer: mergeLayer,
});
const failedResults = new Map();
const imageFailures = new Map();
const imageAnchors = new Map();
let retryTextAvailable = false;
let nextInstanceId = 0;
let nextOperationId = 0;
let nextZIndex = 0;

function safeStorage(name) {
    try {
        return globalThis[name];
    } catch {
        return null;
    }
}
function announce(message) {
    live.textContent = message;
}

function popoverMatches({
    token = null,
    pairKey = null,
    operationId = null,
} = {}) {
    return (
        !resultPopover.hidden &&
        popoverBinding.matches({ token, pairKey, operationId })
    );
}

function bindPopover({ kind, pairKey = null, operationId = null }) {
    return popoverBinding.bind({ kind, pairKey, operationId });
}

function clearPopoverBinding() {
    popoverBinding.clear();
    activePopoverImage = null;
}

function rebindOpenPopover({ operationId, pairKey = null } = {}) {
    if (resultPopover.hidden || !resultAnchor || !popoverBinding.current)
        return false;
    bindPopover({ kind: "operation", operationId, pairKey });
    resultPopover.setAttribute("aria-busy", "true");
    return true;
}

function sameDiscovery(first, second) {
    return (
        first?.name === second?.name &&
        first?.description === second?.description
    );
}

function popoverOwnsImageOperation(operation) {
    if (
        !operation?.imagePairKey ||
        !resultAnchor ||
        !popoverMatches({ pairKey: operation.imagePairKey })
    )
        return false;
    const binding = popoverBinding.current;
    if (binding?.kind === "operation" && binding.operationId !== operation.id)
        return false;
    const visibleDiscovery =
        activePopoverImage?.pairKey === operation.imagePairKey
            ? activePopoverImage.discovery
            : activeDiscovery;
    return sameDiscovery(visibleDiscovery, operation.imageDiscovery);
}

function boundPopoverImage() {
    if (resultPopover.hidden || !resultAnchor) return null;
    const binding = popoverBinding.current;
    if (!binding?.pairKey) return null;
    const pairKey = binding.pairKey;
    const failure = imageFailures.get(`image:${pairKey}`);
    const operation =
        failure?.operation ??
        (activeCombination?.id === binding.operationId
            ? activeCombination
            : null) ??
        (activeImageOperation?.imagePairKey === pairKey
            ? activeImageOperation
            : null);
    const item = itemByPair(pairKey);
    const discovery =
        (activePopoverImage?.pairKey === pairKey
            ? activePopoverImage.discovery
            : null) ??
        operation?.imageDiscovery ??
        (binding.kind === "discovery" && activeImagePair === pairKey
            ? activeDiscovery
            : null) ??
        discoveryData(item);
    return discovery ? { binding, discovery, operation, pairKey } : null;
}

function reconcileEvictedImage(pairKey, entry) {
    const operations = new Set();
    const cachedOperation = imageOperations.get(pairKey);
    if (cachedOperation) operations.add(cachedOperation);
    if (
        activeImageOperation?.imagePairKey === pairKey &&
        (!cachedOperation || cachedOperation === activeImageOperation)
    )
        operations.add(activeImageOperation);
    for (const operation of operations) {
        clearImageTimer(operation);
        operation.cancelled = true;
        operation.imagePending = false;
        operation.imageDisplayed = false;
        operation.imageError = true;
        imageFailures.set(`image:${pairKey}`, {
            id: `image:${pairKey}`,
            pairKey,
            stage: "image",
            discovery: operation.imageDiscovery,
            operation,
            x: operation.x ?? 20,
            y: operation.y ?? 62,
            label: `${operation.imageDiscovery?.name ?? "Illustration"} illustration unavailable — retry`,
        });
        if (operation.imageUrl === entry.url) operation.imageUrl = null;
        if (imageOperations.get(pairKey) === operation)
            imageOperations.delete(pairKey);
        if (activeImageOperation === operation) activeImageOperation = null;
    }
    const popoverImage =
        popoverMatches({ pairKey }) &&
        activePopoverImage?.pairKey === pairKey &&
        activePopoverImage.url === entry.url
            ? activePopoverImage
            : null;
    if (popoverImage) {
        const placeholder = document.createElement("div");
        placeholder.className = "result-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        if (popoverImage.image?.isConnected)
            popoverImage.image.replaceWith(placeholder);
        activePopoverImage = null;
        resultPopover.setAttribute("aria-busy", "false");
    }
    refreshImageVisuals(pairKey);
    updateRetryButtons();
}

const imageCache = createImageCache({
    onEvict(pairKey, entry, reason) {
        if (reason === "evict" || reason === "delete")
            reconcileEvictedImage(pairKey, entry);
        else refreshImageVisuals(pairKey);
    },
});
function handleImageFailure(
    pairKey,
    url,
    operation = null,
    renderToken = null,
    renderedImage = null,
    cacheEntry = null,
) {
    if (operation && imageOperations.get(pairKey) !== operation) return false;
    if (cacheEntry !== null && imageCache.peek(pairKey) !== cacheEntry)
        return false;
    if (renderedImage && !renderedImage.isConnected) return false;
    if (
        renderToken !== null &&
        (!popoverMatches({ token: renderToken, pairKey }) ||
            activePopoverImage?.token !== renderToken ||
            activePopoverImage.image !== renderedImage)
    )
        return false;
    const cached = imageCache.peek(pairKey);
    if (!cached || cached.url !== url) return false;
    const activeOperation =
        operation ??
        (imageOperations.get(pairKey)?.imageUrl === url
            ? imageOperations.get(pairKey)
            : activeImageOperation?.imagePairKey === pairKey &&
                activeImageOperation.imageUrl === url
              ? activeImageOperation
              : null);
    clearImageTimer(activeOperation);
    if (activeOperation) {
        activeOperation.imagePending = false;
        activeOperation.imageDisplayed = false;
        activeOperation.imageError = true;
        if (imageOperations.get(pairKey) === activeOperation)
            imageOperations.delete(pairKey);
        if (activeImageOperation === activeOperation)
            activeImageOperation = null;
    }
    const ownsPopover = operation
        ? popoverOwnsImageOperation(operation)
        : popoverMatches({ pairKey });
    const popoverImage =
        ownsPopover &&
        activePopoverImage?.pairKey === pairKey &&
        activePopoverImage.url === url
            ? activePopoverImage
            : null;
    imageCache.delete(pairKey);
    const item = itemByPair(pairKey);
    const anchor = activeOperation
        ? { x: activeOperation.x, y: activeOperation.y }
        : imageAnchors.get(pairKey);
    imageFailures.set(`image:${pairKey}`, {
        id: `image:${pairKey}`,
        pairKey,
        stage: "image",
        discovery: popoverImage?.discovery ?? discoveryData(item),
        operation: activeOperation,
        x: anchor?.x ?? 20,
        y: anchor?.y ?? 62,
        label: `${(popoverImage?.discovery ?? discoveryData(item))?.name ?? "Illustration"} illustration unavailable — retry`,
    });
    if (!popoverImage) {
        refreshImageVisuals(pairKey);
        renderCanvas();
        return true;
    }
    activePopoverImage = null;
    resultPopover.setAttribute("aria-busy", "false");
    if (!resultAnchor) {
        updateRetryButtons();
        return true;
    }
    openResult(
        popoverImage.discovery,
        resultAnchor.x,
        resultAnchor.y,
        popoverImage.label,
        null,
        true,
        false,
        activeOperation,
        popoverBinding.current,
    );
    announce(
        `${popoverImage.discovery.name} illustration could not be displayed.`,
    );
    return true;
}

function completeImageOperation(pairKey, url) {
    const operation = imageOperations.get(pairKey);
    if (!operation || operation.imageUrl !== url || operation.cancelled)
        return null;
    clearImageTimer(operation);
    operation.imagePending = false;
    operation.imageDisplayed = true;
    imageFailures.delete(`image:${pairKey}`);
    imageOperations.delete(pairKey);
    if (activeImageOperation === operation) activeImageOperation = null;
    updateRetryButtons();
    return operation;
}
function clearImageTimer(operation) {
    if (!operation?.imageTimer) return;
    clearTimeout(operation.imageTimer);
    operation.imageTimer = null;
}
function positionResult(x, y) {
    const gutter = 12;
    const canvasRect = canvas.getBoundingClientRect();
    const resultRect = resultPopover.getBoundingClientRect();
    const rightEdge = Math.min(
        globalThis.innerWidth - gutter,
        canvasRect.right,
    );
    const bottomEdge = Math.min(
        globalThis.innerHeight - gutter,
        canvasRect.bottom,
    );
    const minLeft = Math.max(gutter, canvasRect.left + gutter);
    const minTop = Math.max(gutter, canvasRect.top + gutter);
    const maxLeft = Math.max(minLeft, rightEdge - resultRect.width - gutter);
    const maxTop = Math.max(minTop, bottomEdge - resultRect.height - gutter);
    const desiredLeft = canvasRect.left + x + 90;
    const desiredTop = canvasRect.top + y + 90;
    resultPopover.style.left = `${Math.max(minLeft, Math.min(desiredLeft, maxLeft))}px`;
    resultPopover.style.top = `${Math.max(minTop, Math.min(desiredTop, maxTop))}px`;
}
function cancelAllImageOperations() {
    for (const operation of imageOperations.values()) {
        operation.cancelled = true;
        operation.imagePending = false;
        clearImageTimer(operation);
    }
    imageOperations.clear();
    activeImageOperation = null;
}
function getKey() {
    try {
        return oauth.getToken()?.token ?? "";
    } catch {
        return "";
    }
}
function readTextModel() {
    try {
        const model = localStore?.getItem(TEXT_MODEL_STORAGE_KEY) || "";
        if (isTextModel(model)) return model;
    } catch {
        /* storage may be blocked */
    }
    return DEFAULT_TEXT_MODEL;
}
function getTextModel() {
    return isTextModel(modelSelect.value)
        ? modelSelect.value
        : DEFAULT_TEXT_MODEL;
}
function textModelLabel(model) {
    return TEXT_MODELS.find((entry) => entry.id === model)?.label ?? model;
}
function formatApiError(error) {
    if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
    const details = [
        error.code,
        `attempt ${error.attempt}/${error.maxAttempts}`,
    ];
    if (error.model) details.push(`model ${error.model}`);
    return `${error.message} [${details.join("; ")}]`;
}
for (const model of TEXT_MODELS) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    modelSelect.append(option);
}
modelSelect.value = readTextModel();
function promptForKey() {
    openSettings();
    connectButton.focus();
    announce("Connect your Pollinations wallet to discover new ingredients.");
}
function setAuthStatus(error = null) {
    authStatusMessage =
        error instanceof OAuthError
            ? `${error.code}: ${error.message}`
            : error
              ? "Wallet connection could not be completed. Try again."
              : "";
    renderAuthState();
}
function renderAuthState() {
    const connected = Boolean(getKey());
    connectButton.hidden = connected;
    disconnectButton.hidden = !connected;
    connectButton.disabled = authBusy;
    disconnectButton.disabled = authBusy;
    connectButton.textContent = authBusy
        ? "Connecting…"
        : "Connect Pollinations wallet";
    keyStatus.classList.toggle("is-ready", connected && !authStatusMessage);
    keyStatus.textContent = authBusy
        ? "Connecting to Pollinations…"
        : authStatusMessage ||
          (connected
              ? "Connected for this browser tab."
              : "Not connected yet. Connect your wallet to discover ideas.");
}
function itemById(id) {
    return inventoryItems(state).find((item) => item.id === id) ?? null;
}
function itemByPair(pairKey) {
    return inventoryItems(state).find((item) => item.pair === pairKey) ?? null;
}

function discoveryData(item) {
    return item ? { name: item.name, description: item.description } : null;
}
function itemTone(item) {
    const key = item.id ?? item.name;
    const score = [...key].reduce(
        (total, character) => total + character.charCodeAt(0),
        0,
    );
    return ["lavender", "periwinkle", "mint", "lime"][score % 4];
}
function imageElement(url, pairKey, cacheEntry = imageCache.peek(pairKey)) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.decoding = "async";
    image.loading = "eager";
    image.addEventListener(
        "load",
        () => {
            if (
                !image.isConnected ||
                image.closest(".element-visual")?.dataset.pairKey !== pairKey ||
                imageCache.peek(pairKey) !== cacheEntry ||
                cacheEntry?.url !== url
            )
                return;
            image
                .closest(".element-visual")
                ?.classList.remove("is-placeholder");
            const operation = completeImageOperation(pairKey, url);
            if (operation && resultPopover.hidden)
                announce(`${operation.discovery.name} illustration ready.`);
        },
        { once: true },
    );
    image.addEventListener(
        "error",
        () => {
            if (
                !image.isConnected ||
                image.closest(".element-visual")?.dataset.pairKey !== pairKey ||
                imageCache.peek(pairKey) !== cacheEntry ||
                cacheEntry?.url !== url
            )
                return;
            handleImageFailure(pairKey, url, null, null, image, cacheEntry);
        },
        { once: true },
    );
    return image;
}
function updateImageVisual(slot, item) {
    const cached = item.discovered ? imageCache.get(item.pair) : null;
    slot.classList.toggle("is-placeholder", !cached && item.discovered);
    slot.replaceChildren();
    if (cached) slot.append(imageElement(cached.url, item.pair, cached));
    else if (!item.discovered) {
        const icon = document.createElement("span");
        icon.textContent = item.icon ?? "";
        slot.append(icon);
    }
}
function createElementVisual(item) {
    const slot = document.createElement("span");
    slot.className = "element-visual";
    slot.dataset.pairKey = item.discovered ? item.pair : "";
    slot.setAttribute("aria-hidden", "true");
    updateImageVisual(slot, item);
    return slot;
}
function refreshImageVisuals(pairKey) {
    if (!pairKey) return;
    const item = inventoryItems(state).find((entry) => entry.pair === pairKey);
    if (!item) return;
    for (const slot of document.querySelectorAll(".element-visual"))
        if (slot.dataset.pairKey === pairKey) updateImageVisual(slot, item);
}
function positionWithinCanvas(x, y, width = 44, height = 44) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.max(8, Math.min(x, Math.max(8, rect.width - width - 8))),
        y: Math.max(38, Math.min(y, Math.max(38, rect.height - height - 8))),
    };
}
function positionAtCanvasCenter(x, y, width, height) {
    return positionWithinCanvas(x - width / 2, y - height / 2, width, height);
}
function findOpenPlacement(item, preferredX, preferredY) {
    const width = Math.min(230, Math.max(80, item.name.length * 8 + 48));
    const height = 44;
    const canvasRect = canvas.getBoundingClientRect();
    const occupied = [...canvasItems.querySelectorAll("[data-instance]")].map(
        (chip) => chip.getBoundingClientRect(),
    );
    const candidates = [
        [preferredX, preferredY],
        [preferredX + 120, preferredY],
        [preferredX - 120, preferredY],
        [preferredX, preferredY + 70],
        [preferredX, preferredY - 70],
        [preferredX + 120, preferredY + 70],
        [preferredX - 120, preferredY + 70],
        [preferredX + 120, preferredY - 70],
        [preferredX - 120, preferredY - 70],
    ];
    for (const [x, y] of candidates) {
        const point = positionWithinCanvas(x, y, width, height);
        const candidate = {
            left: canvasRect.left + point.x,
            right: canvasRect.left + point.x + width,
            top: canvasRect.top + point.y,
            bottom: canvasRect.top + point.y + height,
        };
        if (
            occupied.every(
                (rect) =>
                    candidate.right <= rect.left ||
                    candidate.left >= rect.right ||
                    candidate.bottom <= rect.top ||
                    candidate.top >= rect.bottom,
            )
        )
            return point;
    }
    return positionWithinCanvas(preferredX, preferredY, width, height);
}
function updateRetryButtons() {
    retryText.disabled = !retryTextAvailable;
    const boundImage = boundPopoverImage();
    retryImage.disabled =
        !boundImage || boundImage.operation?.imagePending === true;
}
function retryFailedResult(id) {
    const failure = failedResults.get(id) ?? imageFailures.get(id);
    if (!failure || (failure.stage === "image" && !failure.discovery)) return;
    if (failure.stage === "image") {
        const key = getKey();
        if (!key) {
            promptForKey();
            return;
        }
        imageFailures.delete(id);
        const operation = {
            id: ++nextOperationId,
            resetVersion,
            imagePairKey: failure.pairKey,
            discovery: failure.discovery,
            imageDiscovery: failure.discovery,
            x: failure.x,
            y: failure.y,
            cancelled: false,
        };
        imageCache.delete(operation.imagePairKey);
        loadImage(operation, key);
        announce(`${failure.discovery.name} illustration retry started.`);
        return;
    }
    failedResults.delete(id);
    startCombination({
        firstItem: failure.firstItem,
        secondItem: failure.secondItem,
        sourceIds: failure.sourceIds,
        x: failure.x,
        y: failure.y,
        returnFocus: failure.returnFocus,
        returnFocusInstanceId: failure.returnFocusInstanceId,
    });
}
function setTextBusy(next) {
    canvas.setAttribute("aria-busy", String(next));
    live.setAttribute("aria-busy", String(next));
}
function operationIsCurrent(operation) {
    return (
        combinationOperations.get(operation.id) === operation &&
        operation.resetVersion === resetVersion &&
        !operation.cancelled
    );
}
function instanceIsClaimed(id) {
    return combinationOperations.isClaimed(id);
}
function releaseCombination(
    operation,
    preserveSourceIds = false,
    { render = true } = {},
) {
    combinationOperations.finish(operation, {
        preserveSources: preserveSourceIds,
    });
    setTextBusy(combinationOperations.size > 0);
    if (render) renderCanvas();
}
function cancelCombinationOperation(operation) {
    if (!operation || !combinationOperations.get(operation.id)) return;
    combinationOperations.cancel(operation);
    mergeAnimation.cancel(operation.id);
    setTextBusy(combinationOperations.size > 0);
    renderCanvas();
}
function cancelAllCombinationOperations() {
    for (const operation of combinationOperations.cancelAll())
        mergeAnimation.cancel(operation.id);
    setTextBusy(combinationOperations.size > 0);
    renderCanvas();
}
function renderFailureResult(failure) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "canvas-chip failure-result";
    chip.dataset.tone = "lavender";
    chip.dataset.failure = String(failure.id);
    const point = positionAtCanvasCenter(failure.x, failure.y, 190, 44);
    chip.style.left = `${point.x}px`;
    chip.style.top = `${point.y}px`;
    chip.setAttribute("aria-label", `Retry ${failure.label}`);
    const visual = document.createElement("span");
    visual.className = "element-visual is-placeholder";
    visual.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = failure.label;
    chip.append(visual, label);
    chip.addEventListener("click", () => retryFailedResult(failure.id));
    canvasItems.append(chip);
}
function createInstance(item, x, y, isNew = false) {
    if (instances.size >= MAX_CANVAS_INSTANCES) {
        announce(
            `The canvas is full (${MAX_CANVAS_INSTANCES} items). Clear a safe item before placing another.`,
        );
        return null;
    }
    const point = positionWithinCanvas(x, y);
    const instance = {
        id: `instance-${nextInstanceId++}`,
        itemId: item.id,
        x: point.x,
        y: point.y,
        zIndex: ++nextZIndex,
    };
    instances.set(instance.id, instance);
    renderCanvas(isNew ? instance.id : null);
    return instance;
}
function renderCanvas(newId = null) {
    const active = document.activeElement?.dataset?.instance;
    if (active) focusedInstanceId = active;
    canvasItems.replaceChildren();
    for (const instance of instances.values()) {
        const item = itemById(instance.itemId);
        if (!item) continue;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `canvas-chip${instance.id === newId ? " is-new" : ""}`;
        chip.dataset.tone = itemTone(item);
        chip.style.left = `${instance.x}px`;
        chip.style.top = `${instance.y}px`;
        chip.style.zIndex = String(instance.zIndex);
        chip.setAttribute(
            "aria-pressed",
            String(selected.includes(instance.id)),
        );
        chip.dataset.instance = instance.id;
        chip.dataset.pairKey = item.discovered ? item.pair : "";
        const claimed = instanceIsClaimed(instance.id);
        chip.classList.toggle("is-combining", claimed);
        chip.setAttribute("aria-busy", String(claimed));
        chip.setAttribute("aria-disabled", String(claimed));
        if (claimed)
            chip.setAttribute("aria-label", `${item.name} (combining)`);
        chip.disabled = false;
        const label = document.createElement("span");
        label.textContent = item.name;
        chip.append(createElementVisual(item), label);
        chip.addEventListener("focus", () => {
            focusedInstanceId = instance.id;
        });
        chip.addEventListener("pointerdown", (event) =>
            startDrag(event, instance.id),
        );
        chip.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activateInstance(instance.id);
            }
        });
        canvasItems.append(chip);
        const point = positionWithinCanvas(
            instance.x,
            instance.y,
            chip.offsetWidth,
            chip.offsetHeight,
        );
        instance.x = point.x;
        instance.y = point.y;
        chip.style.left = `${point.x}px`;
        chip.style.top = `${point.y}px`;
    }
    for (const failure of failedResults.values()) renderFailureResult(failure);
    for (const failure of imageFailures.values())
        if (!failedResults.has(failure.id)) renderFailureResult(failure);
    const focusId = newId ?? focusedInstanceId;
    if (focusId)
        canvasItems.querySelector(`[data-instance="${focusId}"]`)?.focus();
}
function commitCombination(operation) {
    const resultItem = operation.resultItem;
    if (!resultItem || !operationIsCurrent(operation)) return;
    for (const sourceId of operation.sourceIds) instances.delete(sourceId);
    releaseCombination(operation, false, { render: false });
    const resultWidth = Math.min(
        230,
        Math.max(80, resultItem.name.length * 8 + 48),
    );
    const resultPoint = positionAtCanvasCenter(
        operation.x,
        operation.y,
        resultWidth,
        44,
    );
    const resultInstance = createInstance(
        resultItem,
        resultPoint.x,
        resultPoint.y,
        true,
    );
    if (!resultInstance) return;
    const cachedImage = operation.imagePairKey
        ? imageCache.get(operation.imagePairKey)
        : null;
    if (
        (operation.cached || operation.rebindPopover) &&
        activeCombination === operation
    ) {
        openResult(
            operation.rebindPopover ? operation.discovery : activeDiscovery,
            operation.x,
            operation.y,
            operation.cached ? "In your book" : "Discovery",
            cachedImage?.url ?? null,
            false,
            false,
            activeImageOperation,
            operation,
        );
    }
    if (activeCombination === operation)
        announce(
            operation.cached
                ? `${activeDiscovery.name} is ready from your book.`
                : `${activeDiscovery.name} discovered and added to your book.`,
        );
    operation.stage = "image";
    if (getKey() && !cachedImage && operation.imagePairKey)
        loadImage(operation, getKey());
}
function failCombination(operation) {
    if (!operationIsCurrent(operation)) return;
    const sourceIds = [...operation.sourceIds];
    releaseCombination(operation, true, { render: false });
    failedResults.set(operation.id, {
        id: operation.id,
        stage: operation.stage,
        label:
            operation.stage === "idea"
                ? "Idea unavailable — retry"
                : `${operation.discovery?.name ?? "Result"} unavailable — retry`,
        firstItem: operation.firstItem,
        secondItem: operation.secondItem,
        sourceIds,
        x: operation.x,
        y: operation.y,
        returnFocus: operation.returnFocus,
        returnFocusInstanceId: operation.returnFocusInstanceId,
    });
    if (operation.stage === "idea") {
        resultReturnFocus = operation.returnFocus;
        resultReturnInstanceId =
            operation.returnFocusInstanceId ?? sourceIds[0] ?? null;
    }
    if (activeCombination === operation)
        openError(
            operation.apiError,
            operation.stage,
            operation.x,
            operation.y,
            operation.discovery ?? activeDiscovery,
            operation,
        );
    else
        announce(
            `${operation.firstItem.name} + ${operation.secondItem.name} could not be combined. Retry is available on the canvas.`,
        );
    renderCanvas();
}
function beginMergeVisual(operation) {
    const sourceElements = operation.sourceIds
        .map((id) => canvasItems.querySelector(`[data-instance="${id}"]`))
        .filter(Boolean);
    const visual = mergeAnimation.begin({
        id: operation.id,
        sourceElements,
        onComplete: () => {
            if (!operationIsCurrent(operation)) return;
            operation.visualReady = true;
            settleCombination(operation);
        },
    });
    if (visual.midpoint) {
        operation.x = visual.midpoint.x;
        operation.y = visual.midpoint.y;
    }
    return visual;
}
function settleCombination(operation) {
    if (!operationIsCurrent(operation)) return;
    if (operation.apiState === "pending") return;
    if (operation.apiState === "failure") {
        mergeAnimation.cancel(operation.id);
        failCombination(operation);
        return;
    }
    if (!operation.visualReady) {
        mergeAnimation.resolve(operation.id);
        return;
    }
    if (operation.apiState === "success") commitCombination(operation);
}
function renderInventory() {
    const query = displayNameKey(search.value);
    inventory.replaceChildren();
    const items = inventoryItems(state).filter(
        (item) =>
            !query ||
            `${displayNameKey(item.name)} ${displayNameKey(item.description ?? "")}`.includes(
                query,
            ),
    );
    document.querySelector("#inventory-count").textContent = String(
        inventoryItems(state).length,
    );
    document.querySelector("#discovery-total").textContent =
        `${state.order.length} ${state.order.length === 1 ? "discovery" : "discoveries"}`;
    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "inventory-empty";
        empty.textContent = "No matches";
        inventory.append(empty);
    }
    for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `inventory-chip${item.discovered ? "" : " is-seed"}`;
        button.dataset.tone = itemTone(item);
        button.dataset.pair = item.pair ?? "";
        button.dataset.pairKey = item.discovered ? item.pair : "";
        button.disabled = false;
        const name = document.createElement("small");
        name.textContent = item.name;
        button.append(createElementVisual(item), name);
        button.addEventListener("pointerdown", (event) =>
            startInventoryDrag(event, item),
        );
        button.addEventListener("click", (event) => {
            if (
                suppressInventoryClick &&
                suppressInventoryChip === event.currentTarget
            ) {
                suppressInventoryClick = false;
                suppressInventoryChip = null;
                clearTimeout(inventoryClickReset);
                inventoryClickReset = null;
                return;
            }
            placeFromInventory(item);
        });
        inventory.append(button);
    }
    if (focusedPair && document.activeElement !== search)
        [...inventory.querySelectorAll("[data-pair]")]
            .find((button) => button.dataset.pair === focusedPair)
            ?.focus();
}
function placeFromInventory(item, x = null, y = null) {
    retryTextAvailable = false;
    activeCombination = null;
    clearPopoverBinding();
    resultPopover.setAttribute("aria-busy", "false");
    resultPopover.hidden = true;
    resultAnchor = null;
    focusedPair = item.pair ?? null;
    if (item.discovered) {
        activeImagePair = item.pair;
        activeDiscovery = findDiscovery(state, item.pair);
        activeImageOperation = imageOperations.get(item.pair) ?? null;
    } else {
        activeImagePair = null;
        activeDiscovery = null;
        activeImageOperation = null;
    }
    const offset = instances.size;
    const preferredX = x ?? 40 + (offset % 5) * 120;
    const preferredY = y ?? 80 + (Math.floor(offset / 5) % 4) * 70;
    const placement = findOpenPlacement(item, preferredX, preferredY);
    const instance = createInstance(item, placement.x, placement.y, true);
    announce(`${item.name} placed on the canvas.`);
    instance && renderInventory();
    if (item.discovered)
        openResult(
            activeDiscovery,
            instance.x,
            instance.y,
            "In your book",
            null,
            false,
            true,
            activeImageOperation,
            { kind: "discovery", pairKey: activeImagePair },
        );
}

function isMobileLayout() {
    return globalThis.matchMedia?.("(max-width: 760px)").matches ?? false;
}

function createInventoryDragGhost(item) {
    const ghost = document.createElement("div");
    ghost.className = "inventory-drag-ghost";
    ghost.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = item.name;
    ghost.append(createElementVisual(item), label);
    document.body.append(ghost);
    return ghost;
}

function moveInventoryDragGhost(ghost, event) {
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
}

function findCollisionAt(clientX, clientY, width, height) {
    const canvasRect = canvas.getBoundingClientRect();
    if (
        clientX < canvasRect.left ||
        clientX > canvasRect.right ||
        clientY < canvasRect.top ||
        clientY > canvasRect.bottom
    )
        return null;
    const source = {
        left: clientX - width / 2,
        right: clientX + width / 2,
        top: clientY - height / 2,
        bottom: clientY + height / 2,
    };
    let best = null;
    let bestDistance = Infinity;
    let bestOrder = Infinity;
    let order = 0;
    for (const other of instances.values()) {
        const target = canvasItems
            .querySelector(`[data-instance="${other.id}"]`)
            ?.getBoundingClientRect();
        if (target && rectanglesOverlap(source, target)) {
            const targetCenter = {
                x: (target.left + target.right) / 2,
                y: (target.top + target.bottom) / 2,
            };
            const distance =
                (clientX - targetCenter.x) ** 2 +
                (clientY - targetCenter.y) ** 2;
            const isBetter =
                !best ||
                other.zIndex > best.zIndex ||
                (other.zIndex === best.zIndex &&
                    (distance < bestDistance ||
                        (distance === bestDistance && order < bestOrder)));
            if (isBetter) {
                best = other;
                bestDistance = distance;
                bestOrder = order;
            }
        }
        order += 1;
    }
    return best;
}

function cleanupDragGhost(ghost) {
    ghost?.remove();
}

function startInventoryDrag(event, item) {
    if (inventoryDrag) return;
    const chip = event.currentTarget;
    chip.setPointerCapture(event.pointerId);
    const current = {
        item,
        chip,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
    };
    inventoryDrag = current;
    chip.addEventListener("pointermove", moveInventoryDrag);
    chip.addEventListener("pointerup", endInventoryDrag);
    chip.addEventListener("pointercancel", endInventoryDrag);
    chip.addEventListener("lostpointercapture", endInventoryDrag);
    current.cleanup = () => {
        chip.removeEventListener("pointermove", moveInventoryDrag);
        chip.removeEventListener("pointerup", endInventoryDrag);
        chip.removeEventListener("pointercancel", endInventoryDrag);
        chip.removeEventListener("lostpointercapture", endInventoryDrag);
        cleanupDragGhost(current.ghost);
        current.ghost = null;
        setDropTarget(null);
        if (chip.hasPointerCapture?.(current.pointerId))
            chip.releasePointerCapture(current.pointerId);
    };
    function moveInventoryDrag(move) {
        if (!inventoryDrag || inventoryDrag !== current) return;
        const dx = move.clientX - current.startX;
        const dy = move.clientY - current.startY;
        if (!current.moved) {
            const primaryDistance = isMobileLayout()
                ? Math.abs(dy)
                : Math.abs(dx);
            const crossDistance = isMobileLayout()
                ? Math.abs(dx)
                : Math.abs(dy);
            if (primaryDistance <= 4 || primaryDistance < crossDistance) return;
            current.moved = true;
            current.ghost = createInventoryDragGhost(item);
            chip.classList.add("is-dragging");
        }
        moveInventoryDragGhost(current.ghost, move);
        setDropTarget(
            findCollisionAt(
                move.clientX,
                move.clientY,
                current.ghost.offsetWidth,
                current.ghost.offsetHeight,
            ),
        );
        move.preventDefault?.();
    }
    function endInventoryDrag(end) {
        if (!inventoryDrag || inventoryDrag !== current || current.ended)
            return;
        current.ended = true;
        inventoryDrag = null;
        const dropTarget = current.moved
            ? findCollisionAt(
                  end.clientX,
                  end.clientY,
                  current.ghost?.offsetWidth ?? chip.offsetWidth,
                  current.ghost?.offsetHeight ?? chip.offsetHeight,
              )
            : null;
        current.cleanup();
        chip.classList.remove("is-dragging");
        if (!current.moved || end.type !== "pointerup") return;
        suppressInventoryClick = end.type === "pointerup";
        suppressInventoryChip = suppressInventoryClick ? chip : null;
        if (suppressInventoryClick) {
            clearTimeout(inventoryClickReset);
            inventoryClickReset = setTimeout(() => {
                suppressInventoryClick = false;
                suppressInventoryChip = null;
                inventoryClickReset = null;
            }, 0);
        }
        const rect = canvas.getBoundingClientRect();
        if (
            end.clientX >= rect.left &&
            end.clientX <= rect.right &&
            end.clientY >= rect.top &&
            end.clientY <= rect.bottom
        ) {
            const instance = createInstance(
                current.item,
                end.clientX - rect.left - 22,
                end.clientY - rect.top - 22,
                true,
            );
            renderInventory();
            if (dropTarget) combineInstances(instance, dropTarget);
            else announce(`${current.item.name} placed on the canvas.`);
        }
    }
    current.cancel = () => {
        if (!inventoryDrag || inventoryDrag !== current || current.ended)
            return;
        current.ended = true;
        inventoryDrag = null;
        current.cleanup();
        chip.classList.remove("is-dragging");
    };
}
function startDrag(event, id) {
    if (drag || instanceIsClaimed(id)) return;
    const instance = instances.get(id);
    if (!instance) return;
    const chip = event.currentTarget;
    instance.zIndex = ++nextZIndex;
    chip.style.zIndex = String(instance.zIndex);
    chip.classList.add("is-dragging");
    chip.setPointerCapture(event.pointerId);
    const canvasRect = canvas.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const current = {
        id,
        pointerId: event.pointerId,
        offsetX: event.clientX - chipRect.left,
        offsetY: event.clientY - chipRect.top,
        canvasLeft: canvasRect.left,
        canvasTop: canvasRect.top,
        moved: false,
    };
    drag = current;
    chip.addEventListener("pointermove", moveDrag);
    chip.addEventListener("pointerup", endDrag);
    chip.addEventListener("pointercancel", endDrag);
    chip.addEventListener("lostpointercapture", endDrag);
    current.cleanup = () => {
        chip.removeEventListener("pointermove", moveDrag);
        chip.removeEventListener("pointerup", endDrag);
        chip.removeEventListener("pointercancel", endDrag);
        chip.removeEventListener("lostpointercapture", endDrag);
        chip.classList.remove("is-dragging");
        setDropTarget(null);
        if (chip.hasPointerCapture?.(current.pointerId))
            chip.releasePointerCapture(current.pointerId);
    };
    function moveDrag(move) {
        if (!drag || drag !== current) return;
        if (
            Math.abs(move.clientX - event.clientX) +
                Math.abs(move.clientY - event.clientY) >
            4
        )
            drag.moved = true;
        const point = positionWithinCanvas(
            move.clientX - drag.canvasLeft - drag.offsetX,
            move.clientY - drag.canvasTop - drag.offsetY,
            chip.offsetWidth,
            chip.offsetHeight,
        );
        instance.x = point.x;
        instance.y = point.y;
        chip.style.left = `${point.x}px`;
        chip.style.top = `${point.y}px`;
        setDropTarget(drag.moved ? findCollision(instance) : null);
    }
    function endDrag(end) {
        if (!drag || drag !== current || current.ended) return;
        current.ended = true;
        drag = null;
        const other = current.moved ? findCollision(instance) : null;
        current.cleanup();
        if (end.type !== "pointerup") return;
        if (other) combineInstances(instance, other);
        else if (!current.moved) activateInstance(id);
    }
    current.cancel = () => {
        if (!drag || drag !== current || current.ended) return;
        current.ended = true;
        drag = null;
        current.cleanup();
    };
}
function setDropTarget(target) {
    for (const chip of canvasItems.querySelectorAll(".is-drop-target"))
        chip.classList.remove("is-drop-target");
    if (target)
        canvasItems
            .querySelector(`[data-instance="${target.id}"]`)
            ?.classList.add("is-drop-target");
}

function cancelActiveDrags() {
    inventoryDrag?.cancel?.();
    drag?.cancel?.();
    setDropTarget(null);
    clearTimeout(inventoryClickReset);
    inventoryClickReset = null;
    suppressInventoryClick = false;
    suppressInventoryChip = null;
}

function findCollision(instance) {
    const source = canvasItems
        .querySelector(`[data-instance="${instance.id}"]`)
        ?.getBoundingClientRect();
    if (!source) return null;
    const sourceCenter = {
        x: (source.left + source.right) / 2,
        y: (source.top + source.bottom) / 2,
    };
    let best = null;
    let bestDistance = Infinity;
    let bestOrder = Infinity;
    let order = 0;
    for (const other of instances.values()) {
        if (other.id === instance.id) continue;
        const target = canvasItems
            .querySelector(`[data-instance="${other.id}"]`)
            ?.getBoundingClientRect();
        if (target && rectanglesOverlap(source, target)) {
            const targetCenter = {
                x: (target.left + target.right) / 2,
                y: (target.top + target.bottom) / 2,
            };
            const distance =
                (sourceCenter.x - targetCenter.x) ** 2 +
                (sourceCenter.y - targetCenter.y) ** 2;
            const isBetter =
                !best ||
                other.zIndex > best.zIndex ||
                (other.zIndex === best.zIndex &&
                    (distance < bestDistance ||
                        (distance === bestDistance &&
                            (other.id < best.id ||
                                (other.id === best.id && order < bestOrder)))));
            if (isBetter) {
                best = other;
                bestDistance = distance;
                bestOrder = order;
            }
        }
        order += 1;
    }
    return best;
}
function activateInstance(id) {
    if (instanceIsClaimed(id)) return;
    resultPopover.hidden = true;
    resultPopover.setAttribute("aria-busy", "false");
    clearPopoverBinding();
    resultAnchor = null;
    activeImagePair = null;
    activeDiscovery = null;
    activeImageOperation = null;
    activeCombination = null;
    selected = selected.includes(id)
        ? selected.filter((value) => value !== id)
        : selected.length === 1
          ? [...selected, id]
          : [id];
    renderCanvas();
    if (selected.length === 2) {
        const first = instances.get(selected[0]);
        const second = instances.get(selected[1]);
        selected = [];
        combineInstances(first, second);
    }
}
function clearSelectionForCombination() {
    if (!selected.length) return;
    selected = [];
    renderCanvas();
}
function combineInstances(first, second) {
    if (!first || !second || first.id === second.id) return;
    if (instanceIsClaimed(first.id) || instanceIsClaimed(second.id)) return;
    const firstItem = itemById(first.itemId);
    const secondItem = itemById(second.itemId);
    if (!firstItem || !secondItem) return;
    clearSelectionForCombination();
    startCombination({
        firstItem,
        secondItem,
        sourceIds: [first.id, second.id],
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
    });
}
function failImageDecode(operation) {
    if (
        operation.cancelled ||
        operation.imagePending !== true ||
        imageOperations.get(operation.imagePairKey) !== operation
    )
        return;
    handleImageFailure(operation.imagePairKey, operation.imageUrl, operation);
}
function startCombination({
    firstItem,
    secondItem,
    sourceIds = [],
    x,
    y,
    topmostSourceId = sourceIds[0] ?? null,
    returnFocus = document.activeElement?.isConnected
        ? document.activeElement
        : null,
    returnFocusInstanceId = document.activeElement?.dataset?.instance ?? null,
    rebindPopover = false,
}) {
    const pairKey = canonicalPair(firstItem.id, secondItem.id);
    const existing = combinationOperations.getByPair(pairKey);
    if (existing && operationIsCurrent(existing)) return;
    const cached = findDiscovery(state, pairKey);
    const cachedItem = cached
        ? resolveInventoryItem(state, pairKey, cached)
        : null;
    const cachedImagePair = cachedItem?.discovered ? cachedItem.pair : null;
    const cachedImageDiscovery = discoveryData(cachedItem);
    const key = getKey();
    const model = getTextModel();
    if (!key && !cached) {
        promptForKey();
        return;
    }
    const operation = {
        id: ++nextOperationId,
        resetVersion,
        pairKey,
        firstItem,
        secondItem,
        model,
        sourceIds:
            sourceIds.length === 2 && sourceIds[0] !== sourceIds[1]
                ? [...sourceIds]
                : [],
        discovery: cached ? { ...cached } : null,
        x,
        y,
        returnFocus,
        returnFocusInstanceId,
        rebindPopover,
        topmostSourceId,
        imagePairKey: cachedImagePair,
        imageDiscovery: cachedImageDiscovery,
        cached: Boolean(cached),
        stage: cached ? "image" : "idea",
        apiState: "pending",
        apiError: null,
        resultItem: null,
        visualReady: false,
    };
    if (!combinationOperations.begin(operation)) return;
    if (rebindPopover)
        rebindOpenPopover({ operationId: operation.id, pairKey: null });
    else if (!resultPopover.hidden) {
        resultPopover.hidden = true;
        clearPopoverBinding();
        resultAnchor = null;
        activeImagePair = null;
        activeDiscovery = null;
        activeImageOperation = null;
    }
    activeCombination = operation;
    retryTextAvailable = false;
    activeImagePair = cachedImagePair;
    activeDiscovery = cachedImageDiscovery ?? operation.discovery;
    activeImageOperation = cachedImagePair
        ? (imageOperations.get(cachedImagePair) ?? null)
        : null;
    if (resultPopover.hidden) resultPopover.setAttribute("aria-busy", "false");
    setTextBusy(combinationOperations.size > 0);
    renderCanvas();
    beginMergeVisual(operation);
    announce(`Combining ${firstItem.name} + ${secondItem.name}`);
    (async () => {
        try {
            const discovery =
                cached ||
                (await api.discoverText(
                    { first: firstItem, second: secondItem },
                    key,
                    operation.model,
                ));
            if (!operationIsCurrent(operation)) return;
            setTextBusy(combinationOperations.size > 0);
            operation.discovery = { ...discovery };
            if (!cached && operation.resetVersion === resetVersion)
                state = saveState(
                    gameReducer(state, {
                        type: "discover",
                        pair: pairKey,
                        discovery,
                    }),
                    localStore,
                );
            renderInventory();
            const resultItem = resolveInventoryItem(state, pairKey, discovery);
            if (!resultItem)
                throw new ApiError(
                    "The discovered idea could not be placed. Retry the idea.",
                    "parse",
                    0,
                    true,
                );
            operation.imagePairKey = resultItem.discovered
                ? resultItem.pair
                : null;
            operation.imageDiscovery = discoveryData(resultItem);
            operation.resultItem = resultItem;
            if (activeCombination === operation) {
                activeImagePair = operation.imagePairKey;
                activeDiscovery = operation.imageDiscovery;
                activeImageOperation = operation.imagePairKey
                    ? (imageOperations.get(operation.imagePairKey) ?? null)
                    : null;
            }
            const removableSources = operation.sourceIds.filter((id) =>
                instances.has(id),
            ).length;
            if (instances.size - removableSources >= MAX_CANVAS_INSTANCES)
                throw new ApiError(
                    `The canvas is full (${MAX_CANVAS_INSTANCES} items). Clear a safe item before placing the result.`,
                    "canvas_full",
                    0,
                    true,
                );
            operation.stage = "image";
            operation.apiState = "success";
            settleCombination(operation);
        } catch (error) {
            if (operationIsCurrent(operation)) {
                operation.apiState = "failure";
                operation.apiError = error;
                settleCombination(operation);
            }
        }
    })();
}
function updateOpenPopoverImage(operation, imageUrl, imageOperation = null) {
    if (!popoverOwnsImageOperation(operation)) return;
    const discovery =
        activePopoverImage?.pairKey === operation.imagePairKey
            ? activePopoverImage.discovery
            : activeDiscovery;
    if (!discovery) return;
    openResult(
        discovery,
        resultAnchor.x,
        resultAnchor.y,
        "Illustrated",
        imageUrl,
        false,
        false,
        imageOperation,
        popoverBinding.current,
    );
}
async function loadImage(operation, key) {
    if (
        operation.imagePending ||
        !operation.imagePairKey ||
        !operation.imageDiscovery ||
        operation.cancelled
    )
        return;
    imageAnchors.set(operation.imagePairKey, {
        x: operation.x,
        y: operation.y,
    });
    if (!key) {
        if (activeImagePair === operation.imagePairKey) promptForKey();
        return;
    }
    const pending = imageOperations.get(operation.imagePairKey);
    if (pending?.imagePending) {
        if (activeImagePair === operation.imagePairKey)
            activeImageOperation = pending;
        updateRetryButtons();
        return;
    }
    const cached = imageCache.get(operation.imagePairKey);
    if (cached) {
        imageFailures.delete(`image:${operation.imagePairKey}`);
        operation.imageUrl = cached.url;
        operation.imageDisplayed = true;
        operation.imagePending = false;
        refreshImageVisuals(operation.imagePairKey);
        updateOpenPopoverImage(operation, cached.url);
        updateRetryButtons();
        return;
    }
    operation.imagePending = true;
    operation.imageDisplayed = false;
    operation.imageError = false;
    imageOperations.set(operation.imagePairKey, operation);
    if (activeImagePair === operation.imagePairKey) {
        activeImageOperation = operation;
        resultPopover.setAttribute("aria-busy", "true");
    }
    updateRetryButtons();
    try {
        const blob = await api.generateImage(operation.imageDiscovery, key);
        if (
            operation.cancelled ||
            imageOperations.get(operation.imagePairKey) !== operation
        )
            return;
        const imageUrl = imageCache.set(operation.imagePairKey, blob);
        imageFailures.delete(`image:${operation.imagePairKey}`);
        operation.imageUrl = imageUrl;
        refreshImageVisuals(operation.imagePairKey);
        updateOpenPopoverImage(operation, imageUrl, operation);
        operation.imageTimer = setTimeout(
            () => failImageDecode(operation),
            IMAGE_DECODE_TIMEOUT_MS,
        );
    } catch (error) {
        if (
            !operation.cancelled &&
            imageOperations.get(operation.imagePairKey) === operation
        ) {
            operation.imageError = true;
            imageFailures.set(`image:${operation.imagePairKey}`, {
                id: `image:${operation.imagePairKey}`,
                pairKey: operation.imagePairKey,
                stage: "image",
                discovery: operation.imageDiscovery,
                operation,
                x: operation.x ?? 20,
                y: operation.y ?? 62,
                label: `${operation.imageDiscovery.name} illustration unavailable — retry`,
            });
            if (popoverOwnsImageOperation(operation))
                openError(
                    error,
                    "image",
                    resultAnchor.x,
                    resultAnchor.y,
                    operation.imageDiscovery,
                    operation,
                );
            else
                announce(
                    `${operation.imageDiscovery.name} illustration unavailable. Retry is available on the canvas.`,
                );
            refreshImageVisuals(operation.imagePairKey);
            renderCanvas();
        }
    } finally {
        if (operation.cancelled || !operation.imageUrl) {
            operation.imagePending = false;
            if (imageOperations.get(operation.imagePairKey) === operation)
                imageOperations.delete(operation.imagePairKey);
            if (activeImageOperation === operation) {
                activeImageOperation = null;
                if (activeImagePair === operation.imagePairKey)
                    resultPopover.setAttribute("aria-busy", "false");
            }
            updateRetryButtons();
        }
    }
}
function openResult(
    discovery,
    x,
    y,
    label = "Discovery",
    imageUrl = null,
    failed = false,
    focusPanel = true,
    imageOperation = null,
    binding = null,
) {
    if (!discovery) return;
    const imagePairKey = imageOperation?.imagePairKey ?? activeImagePair;
    const cachedUrl = imagePairKey ? imageCache.get(imagePairKey)?.url : null;
    const displayedImageUrl = imageUrl ?? cachedUrl;
    const displayedImageEntry = imagePairKey
        ? imageCache.peek(imagePairKey)
        : null;
    if (imagePairKey) {
        activeImagePair = imagePairKey;
        activeDiscovery = discovery;
    }
    if (resultPopover.hidden) {
        resultReturnFocus = document.activeElement?.isConnected
            ? document.activeElement
            : null;
        resultReturnInstanceId =
            document.activeElement?.dataset?.instance ?? null;
    }
    const owner =
        (binding?.kind
            ? binding
            : binding
              ? {
                    kind: "operation",
                    operationId: binding.id,
                    pairKey: binding.pairKey ?? binding.imagePairKey ?? null,
                }
              : null) ??
        (imageOperation
            ? { kind: "operation", operationId: imageOperation.id }
            : activeCombination
              ? { kind: "operation", operationId: activeCombination.id }
              : { kind: "discovery" });
    const activeBinding = bindPopover({
        kind: owner.kind,
        operationId: owner.operationId ?? null,
        pairKey: imagePairKey ?? owner.pairKey ?? null,
    });
    resultPopover.hidden = false;
    resultPopover.setAttribute(
        "aria-busy",
        String(Boolean(imageOperation?.imagePending)),
    );
    resultAnchor = { x, y };
    resultLabel.textContent = label;
    resultContent.replaceChildren();
    activePopoverImage = null;
    if (displayedImageUrl) {
        const renderToken = activeBinding.token;
        activePopoverImage = {
            pairKey: imagePairKey,
            url: displayedImageUrl,
            token: renderToken,
            discovery,
            label,
        };
        const image = document.createElement("img");
        image.className = "result-image";
        image.setAttribute(
            "aria-busy",
            String(Boolean(imageOperation?.imagePending)),
        );
        image.src = displayedImageUrl;
        image.alt = `${discovery.name} illustration`;
        image.loading = "eager";
        image.decoding = "async";
        image.addEventListener(
            "load",
            () => {
                if (
                    !image.isConnected ||
                    !imagePairKey ||
                    !popoverMatches({
                        token: renderToken,
                        pairKey: imagePairKey,
                    }) ||
                    imageCache.peek(imagePairKey) !== displayedImageEntry ||
                    imageCache.peek(imagePairKey)?.url !== displayedImageUrl ||
                    activePopoverImage?.token !== renderToken ||
                    activePopoverImage.image !== image
                ) {
                    return;
                }
                completeImageOperation(imagePairKey, displayedImageUrl);
                if (
                    imageOperation &&
                    imageOperation.imageUrl === displayedImageUrl
                ) {
                    clearImageTimer(imageOperation);
                    imageOperation.imagePending = false;
                    imageOperation.imageDisplayed = true;
                    if (activeImageOperation === imageOperation)
                        activeImageOperation = null;
                }
                image.setAttribute("aria-busy", "false");
                resultPopover.setAttribute("aria-busy", "false");
                imageFailures.delete(`image:${imagePairKey}`);
                updateRetryButtons();
                announce(`${discovery.name} illustration ready.`);
            },
            { once: true },
        );
        image.addEventListener(
            "error",
            () =>
                handleImageFailure(
                    imagePairKey,
                    displayedImageUrl,
                    imageOperation,
                    renderToken,
                    image,
                    displayedImageEntry,
                ),
            { once: true },
        );
        activePopoverImage.image = image;
        resultContent.append(image);
    } else {
        const placeholder = document.createElement("div");
        placeholder.className = "result-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        resultContent.append(placeholder);
    }
    const name = document.createElement("h2");
    name.className = "result-name";
    name.id = "result-title";
    name.textContent = discovery.name;
    const description = document.createElement("p");
    description.className = "result-description";
    description.textContent = discovery.description;
    resultContent.append(name, description);
    if (failed) {
        const message = document.createElement("p");
        message.className = "result-message";
        message.textContent = "Illustration unavailable. Retry the image.";
        resultContent.append(message);
    }
    updateRetryButtons();
    positionResult(x, y);
    if (focusPanel) document.querySelector("#result-close")?.focus();
}
function openError(
    error,
    stage,
    x,
    y,
    discovery = activeDiscovery,
    operation = null,
) {
    const messageText = formatApiError(error);
    if (!discovery) {
        resultPopover.hidden = false;
        bindPopover({
            kind: operation ? "operation" : "discovery",
            operationId: operation?.id ?? null,
            pairKey: operation?.pairKey ?? null,
        });
        resultPopover.setAttribute("aria-busy", "false");
        resultAnchor = { x, y };
        resultLabel.textContent = "Try again";
        resultContent.replaceChildren();
        activePopoverImage = null;
        const title = document.createElement("h2");
        title.className = "result-name";
        title.id = "result-title";
        title.textContent = "Idea unavailable";
        const message = document.createElement("p");
        message.className = "result-message";
        message.textContent = messageText;
        resultContent.append(title, message);
        retryTextAvailable = stage === "idea";
        retryText.disabled = !retryTextAvailable;
        retryImage.disabled = true;
        positionResult(x, y);
        announce(messageText);
        document.querySelector("#result-close")?.focus();
        return;
    }
    openResult(
        discovery,
        x,
        y,
        "Try again",
        null,
        stage === "image",
        false,
        null,
        operation,
    );
    const message = document.createElement("p");
    message.className = "result-message";
    message.textContent = messageText;
    resultContent.append(message);
    positionResult(x, y);
    retryTextAvailable = false;
    const boundImage = boundPopoverImage();
    retryImage.disabled =
        stage !== "image" ||
        !boundImage ||
        boundImage.operation?.imagePending === true;
    announce(messageText);
}
function closeResult() {
    setTextBusy(combinationOperations.size > 0);
    resultPopover.hidden = true;
    clearPopoverBinding();
    resultAnchor = null;
    activeImagePair = null;
    activeDiscovery = null;
    activeCombination = null;
    activeImageOperation = null;
    retryTextAvailable = false;
    resultPopover.setAttribute("aria-busy", "false");
    const returnFocus = resultReturnFocus;
    resultReturnFocus = null;
    const fallback = resultReturnInstanceId
        ? canvasItems.querySelector(
              `[data-instance="${resultReturnInstanceId}"]`,
          )
        : null;
    resultReturnInstanceId = null;
    const focusTarget = returnFocus?.isConnected ? returnFocus : fallback;
    if (focusTarget && !focusTarget.disabled) focusTarget.focus();
}
function cancelCombination() {
    if (!activeCombination) return;
    cancelCombinationOperation(activeCombination);
    selected = [];
    activeImagePair = null;
    activeDiscovery = null;
    clearPopoverBinding();
    activeCombination = null;
    activeImageOperation = null;
    retryTextAvailable = false;
    resultPopover.hidden = true;
    resultAnchor = null;
    resultPopover.setAttribute("aria-busy", "false");
    renderCanvas();
    announce(
        "Combination cancelled. Your ingredients are still on the canvas.",
    );
}
function openSettings() {
    settingsDialog.showModal();
    modelSelect.value = readTextModel();
    renderAuthState();
}

search.addEventListener("input", renderInventory);
document
    .querySelector("#settings-open")
    .addEventListener("click", openSettings);
document.querySelector("#help-open").addEventListener("click", () => {
    helpDialog.showModal();
});
document.querySelector("#settings-close").addEventListener("click", () => {
    settingsDialog.close();
});
function saveTextModelPreference() {
    const model = getTextModel();
    try {
        localStore?.setItem(TEXT_MODEL_STORAGE_KEY, model);
    } catch {
        /* storage may be blocked */
    }
    renderAuthState();
    announce(`Text model saved: ${textModelLabel(model)}.`);
}
modelSelect.addEventListener("change", saveTextModelPreference);
function invalidateAuthOperations() {
    resetVersion += 1;
    cancelActiveDrags();
    cancelAllCombinationOperations();
    cancelAllImageOperations();
    failedResults.clear();
    imageFailures.clear();
    selected = [];
    activeImagePair = null;
    activeDiscovery = null;
    clearPopoverBinding();
    activeCombination = null;
    activeImageOperation = null;
    retryTextAvailable = false;
    resultPopover.hidden = true;
    resultAnchor = null;
    resultPopover.setAttribute("aria-busy", "false");
    renderCanvas();
}
async function connectWallet() {
    if (authBusy) return;
    authStatusMessage = "";
    authBusy = true;
    renderAuthState();
    try {
        const result = await oauth.begin();
        globalThis.location.assign(result.authorizationUrl);
    } catch (error) {
        authBusy = false;
        setAuthStatus(error);
        announce(
            error instanceof OAuthError
                ? `${error.code}: ${error.message}`
                : "Wallet connection could not be started. Try again.",
        );
    }
}
async function processOAuthCallback() {
    authBusy = true;
    renderAuthState();
    try {
        const result = await oauth.handleCallback();
        authBusy = false;
        if (result.kind === "none") {
            renderAuthState();
            return;
        }
        if (result.kind === "success") {
            authStatusMessage = "";
            renderAuthState();
            announce("Pollinations wallet connected for this tab.");
            return;
        }
        setAuthStatus(result.error);
        announce(`${result.error.code}: ${result.error.message}`);
    } catch {
        authBusy = false;
        setAuthStatus(new OAuthError("OAUTH_CALLBACK_INVALID"));
        announce(
            "OAUTH_CALLBACK_INVALID: The wallet callback was invalid. Connect again.",
        );
    }
}
function disconnectWallet() {
    if (authBusy) return;
    invalidateAuthOperations();
    oauth.disconnect();
    authStatusMessage = "";
    renderAuthState();
    announce("Pollinations wallet disconnected in this tab.");
}
connectButton.addEventListener("click", connectWallet);
disconnectButton.addEventListener("click", disconnectWallet);
document.querySelector("#result-close").addEventListener("click", closeResult);
retryImage.addEventListener("click", () => {
    const boundImage = boundPopoverImage();
    if (boundImage && boundImage.operation?.imagePending !== true) {
        const key = getKey();
        if (!key) {
            promptForKey();
            return;
        }
        const anchor = resultAnchor ?? { x: 20, y: 62 };
        const imageDiscovery = boundImage.discovery;
        const operation = {
            id: ++nextOperationId,
            resetVersion,
            imagePairKey: boundImage.pairKey,
            discovery: imageDiscovery,
            imageDiscovery,
            x: anchor.x,
            y: anchor.y,
            cancelled: false,
        };
        rebindOpenPopover({
            operationId: operation.id,
            pairKey: operation.imagePairKey,
        });
        imageCache.delete(operation.imagePairKey);
        activeImageOperation = operation;
        loadImage(operation, key);
    }
});
retryText.addEventListener("click", () => {
    if (retryTextAvailable && activeCombination)
        startCombination({
            firstItem: activeCombination.firstItem,
            secondItem: activeCombination.secondItem,
            sourceIds: activeCombination.sourceIds,
            x: activeCombination.x,
            y: activeCombination.y,
            returnFocus: activeCombination.returnFocus,
            returnFocusInstanceId: activeCombination.returnFocusInstanceId,
            rebindPopover: popoverMatches({
                operationId: activeCombination.id,
            }),
        });
});
resetButton.addEventListener("click", () => {
    if (!globalThis.confirm("Reset your local discovery book?")) return;
    resetVersion += 1;
    cancelActiveDrags();
    cancelAllCombinationOperations();
    cancelAllImageOperations();
    failedResults.clear();
    imageFailures.clear();
    state = createInitialState();
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
        try {
            localStore?.removeItem(key);
        } catch {
            /* storage may be blocked */
        }
    }
    instances = new Map();
    imageCache.clear();
    nextInstanceId = 0;
    nextZIndex = 0;
    selected = [];
    closeResult();
    renderCanvas();
    renderInventory();
    announce("Your local book was reset.");
});
globalThis.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (settingsDialog.open || helpDialog.open) return;
        if (!resultPopover.hidden) {
            event.preventDefault();
            closeResult();
        } else if (activeCombination && operationIsCurrent(activeCombination)) {
            event.preventDefault();
            cancelCombination();
        } else if (!selected.length) return;
        else {
            selected = [];
            renderCanvas();
        }
    }
});
globalThis.addEventListener("resize", () => {
    const activeOperations = combinationOperations.values();
    for (const operation of activeOperations)
        if (operationIsCurrent(operation)) mergeAnimation.cancel(operation.id);
    for (const instance of instances.values())
        Object.assign(instance, positionWithinCanvas(instance.x, instance.y));
    renderCanvas();
    for (const operation of activeOperations) {
        if (!operationIsCurrent(operation)) continue;
        const sourceElements = operation.sourceIds
            .map((id) => canvasItems.querySelector(`[data-instance="${id}"]`))
            .filter(Boolean);
        const sourceRects = sourceElements.map((element) =>
            element.getBoundingClientRect(),
        );
        const canvasRect = canvas.getBoundingClientRect();
        if (sourceRects.length >= 2) {
            const midpoint = visualMidpoint(
                sourceRects[0],
                sourceRects[1],
                canvasRect,
            );
            operation.x = midpoint.x;
            operation.y = midpoint.y;
        }
        operation.visualReady = false;
        beginMergeVisual(operation);
    }
    renderCanvas();
    for (const operation of activeOperations) settleCombination(operation);
    if (!resultPopover.hidden && resultAnchor)
        positionResult(resultAnchor.x, resultAnchor.y);
});
globalThis.addEventListener("pagehide", () => {
    resetVersion += 1;
    cancelActiveDrags();
    cancelAllCombinationOperations();
    cancelAllImageOperations();
    imageCache.clear();
});

for (const [index, seed] of SEEDS.entries())
    createInstance(
        seed,
        70 + (index % 2) * 180,
        90 + Math.floor(index / 2) * 110,
    );
renderCanvas();
renderInventory();
renderAuthState();
queueMicrotask(() => {
    void processOAuthCallback();
});
