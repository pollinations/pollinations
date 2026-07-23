const API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const AUTH_ISSUER = "https://enter.pollinations.ai";
const AUTH_AUTHORIZE_URL = `${AUTH_ISSUER}/authorize`;
const AUTH_STORAGE_KEY = "robot-dj-pollinations-session";
const AUTH_PENDING_KEY = "robot-dj-oauth-pending";
const DEFAULT_MODEL = "gemini-fast";
const AUTH_MODELS = [DEFAULT_MODEL];
const AUTH_BUDGET = 5;
const AUTH_EXPIRY_DAYS = 7;
const DB_NAME = "pollinations-robot-dj";
const DB_STORE = "settings";
const LIBRARY_KEY = "music-library";
const CAMERA_STORAGE_KEY = "robot-dj-camera";
const SNAPSHOT_DELAY_MS = 8_000;
const RESCAN_INTERVAL_MS = 30_000;
const MODEL_REQUEST_TIMEOUT_MS = 75_000;
const CROSSFADE_SECONDS = 8;
const EXCERPT_SECONDS = 120;
const MAX_CANDIDATES = 80;
const RECENT_TRACK_COUNT = 8;

const $ = (id) => document.getElementById(id);

const elements = {
    authStatus: $("authStatus"),
    connectButton: $("connectButton"),
    disconnectButton: $("disconnectButton"),
    chooseFolderButton: $("chooseFolderButton"),
    folderFallback: $("folderFallback"),
    dropZone: $("dropZone"),
    reconnectButton: $("reconnectButton"),
    startButton: $("startButton"),
    fullscreenButton: $("fullscreenButton"),
    pauseButton: $("pauseButton"),
    skipButton: $("skipButton"),
    scanButton: $("scanButton"),
    volumeInput: $("volumeInput"),
    libraryStatus: $("libraryStatus"),
    cameraStatus: $("cameraStatus"),
    aiStatus: $("aiStatus"),
    libraryCount: $("libraryCount"),
    libraryName: $("libraryName"),
    nowPlaying: $("nowPlaying"),
    nextPanel: $("nextPanel"),
    nextTrack: $("nextTrack"),
    nextStatus: $("nextStatus"),
    roomRead: $("roomRead"),
    thinkingLine: $("thinkingLine"),
    progressBar: $("progressBar"),
    elapsedTime: $("elapsedTime"),
    durationTime: $("durationTime"),
    cameraPlaceholder: $("cameraPlaceholder"),
    cameraVideo: $("cameraVideo"),
    cameraLive: $("cameraLive"),
    cameraPicker: $("cameraPicker"),
    cameraSelect: $("cameraSelect"),
    snapshotCanvas: $("snapshotCanvas"),
    errorMessage: $("errorMessage"),
};

let tracks = [];
let rememberedSource = null;
let cameraStream = null;
let selectedCameraId = localStorage.getItem(CAMERA_STORAGE_KEY) || "";
let latestSnapshot = null;
let audioContext = null;
let masterGain = null;
let decks = [];
let activeDeckIndex = 0;
let currentTrack = null;
let queuedTrack = null;
let history = [];
let scanTimer = null;
let selectionInFlight = false;
let isCrossfading = false;
let fallbackLoading = false;
let djStarted = false;
let textFitFrame = null;
let authSession = loadAuthSession();

sessionStorage.removeItem("robot-dj-api-key");
$("fadeSeconds").textContent = CROSSFADE_SECONDS;

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
}

function clearError() {
    elements.errorMessage.hidden = true;
    elements.errorMessage.textContent = "";
}

function loadAuthSession() {
    try {
        const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
        if (!session?.accessToken?.startsWith("sk_")) return null;
        if (!AUTH_MODELS.every((model) => session.models?.includes(model))) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        if (session.expiresAt && session.expiresAt <= Date.now()) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
    }
}

function saveAuthSession(session) {
    authSession = session;
    if (session)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
    updateAuthUi();
}

function updateStartButtonState() {
    elements.startButton.disabled =
        tracks.length === 0 || !authSession || djStarted;
}

function updateAuthUi() {
    const connected = Boolean(authSession);
    elements.authStatus.textContent = connected ? "CONNECTED" : "NOT CONNECTED";
    elements.connectButton.hidden = connected;
    elements.disconnectButton.hidden = !connected;
    updateStartButtonState();
}

function base64Url(bytes) {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function randomBase64Url(length) {
    return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function oauthRedirectUri() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
}

function cleanOauthCallbackUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function connectPollinations() {
    clearError();
    elements.connectButton.disabled = true;
    elements.connectButton.textContent = "CONNECTING…";
    try {
        const state = randomBase64Url(24);
        const redirectUri = oauthRedirectUri();
        sessionStorage.setItem(
            AUTH_PENDING_KEY,
            JSON.stringify({ state, createdAt: Date.now() }),
        );

        const authorizeUrl = new URL(AUTH_AUTHORIZE_URL);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("models", AUTH_MODELS.join(","));
        authorizeUrl.searchParams.set("budget", String(AUTH_BUDGET));
        authorizeUrl.searchParams.set("expiry", String(AUTH_EXPIRY_DAYS));
        window.location.assign(authorizeUrl);
    } catch (error) {
        elements.connectButton.disabled = false;
        elements.connectButton.textContent = "CONNECT POLLINATIONS";
        showError(error.message);
    }
}

async function handleOauthCallback() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("api_key");
    const error = params.get("error");
    if (!accessToken && !error) return;

    let pending;
    try {
        pending = JSON.parse(sessionStorage.getItem(AUTH_PENDING_KEY));
    } catch {
        pending = null;
    }
    const receivedState = params.get("state");
    if (!pending || !receivedState || receivedState !== pending.state) {
        cleanOauthCallbackUrl();
        throw new Error(
            "Pollinations login was rejected because its security state did not match.",
        );
    }

    sessionStorage.removeItem(AUTH_PENDING_KEY);
    cleanOauthCallbackUrl();
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
        throw new Error("Pollinations login expired. Please connect again.");
    }
    if (error) {
        throw new Error(
            params.get("error_description") ||
                `Pollinations login failed: ${error}`,
        );
    }

    if (!accessToken.startsWith("sk_")) {
        throw new Error("Pollinations returned an invalid delegated key.");
    }

    saveAuthSession({
        accessToken,
        expiresAt: Date.now() + AUTH_EXPIRY_DAYS * 86400 * 1000,
        models: AUTH_MODELS,
    });
}

function disconnectPollinations() {
    saveAuthSession(null);
    elements.aiStatus.textContent = "ROBOT IDLE";
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function databaseGet(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readonly");
        const request = transaction.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
}

async function databasePut(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readwrite");
        transaction.objectStore(DB_STORE).put(value, key);
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

async function hasReadPermission(handle, request = false) {
    if (!handle.queryPermission) return true;
    const options = { mode: "read" };
    if ((await handle.queryPermission(options)) === "granted") return true;
    return request && (await handle.requestPermission(options)) === "granted";
}

function updateLibraryUi(label = "No folder selected") {
    elements.libraryCount.textContent = `${tracks.length} TRACK${tracks.length === 1 ? "" : "S"} READY`;
    elements.libraryName.textContent = label;
    elements.libraryStatus.textContent = tracks.length
        ? `${tracks.length} TRACKS LOADED`
        : "NO LIBRARY";
    updateStartButtonState();
}

function syncSafeInteger(bytes) {
    return (
        ((bytes[0] & 0x7f) << 21) |
        ((bytes[1] & 0x7f) << 14) |
        ((bytes[2] & 0x7f) << 7) |
        (bytes[3] & 0x7f)
    );
}

function decodeId3Text(bytes) {
    if (bytes.length < 2) return "";
    const encoding = bytes[0];
    let content = bytes.slice(1);
    let decoder;

    if (encoding === 0) decoder = new TextDecoder("windows-1252");
    else if (encoding === 3) decoder = new TextDecoder("utf-8");
    else if (encoding === 2) decoder = new TextDecoder("utf-16be");
    else {
        const bigEndian = content[0] === 0xfe && content[1] === 0xff;
        decoder = new TextDecoder(bigEndian ? "utf-16be" : "utf-16le");
        if (
            (content[0] === 0xff && content[1] === 0xfe) ||
            (content[0] === 0xfe && content[1] === 0xff)
        ) {
            content = content.slice(2);
        }
    }

    return decoder.decode(content).replaceAll("\u0000", "").trim();
}

function metadataFromFilename(filename) {
    const base = filename.replace(/\.mp3$/i, "");
    const parts = base.split(/\s[-–—]\s/, 2);
    if (parts.length === 2)
        return { artist: parts[0].trim(), title: parts[1].trim() };
    return { artist: "", title: base.trim() };
}

async function readTrackMetadata(file) {
    const fallback = metadataFromFilename(file.name);
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    if (
        bytes.length < 20 ||
        String.fromCharCode(...bytes.slice(0, 3)) !== "ID3"
    ) {
        return fallback;
    }

    const version = bytes[3];
    const tagEnd = Math.min(
        bytes.length,
        10 + syncSafeInteger(bytes.slice(6, 10)),
    );
    let offset = 10;
    let artist = "";
    let title = "";

    while (offset + 10 <= tagEnd) {
        const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const sizeBytes = bytes.slice(offset + 4, offset + 8);
        const size =
            version === 4
                ? syncSafeInteger(sizeBytes)
                : new DataView(
                      sizeBytes.buffer,
                      sizeBytes.byteOffset,
                      4,
                  ).getUint32(0);
        if (!size || offset + 10 + size > tagEnd) break;
        const value = bytes.slice(offset + 10, offset + 10 + size);
        if (id === "TIT2") title = decodeId3Text(value);
        if (id === "TPE1") artist = decodeId3Text(value);
        if (artist && title) break;
        offset += 10 + size;
    }

    return {
        artist: artist || fallback.artist,
        title: title || fallback.title,
    };
}

async function collectMp3Handles(handle, path = "") {
    if (handle.kind === "file") {
        return handle.name.toLowerCase().endsWith(".mp3")
            ? [{ handle, path: path || handle.name }]
            : [];
    }

    const found = [];
    for await (const [name, child] of handle.entries()) {
        found.push(
            ...(await collectMp3Handles(
                child,
                path ? `${path}/${name}` : name,
            )),
        );
    }
    return found;
}

async function indexHandles(handles, label) {
    clearError();
    elements.libraryStatus.textContent = "READING MP3s…";
    elements.libraryName.textContent = `Indexing ${label}`;

    const collected = [];
    for (const handle of handles)
        collected.push(...(await collectMp3Handles(handle)));

    const indexed = [];
    for (let i = 0; i < collected.length; i += 16) {
        const batch = collected.slice(i, i + 16);
        indexed.push(
            ...(await Promise.all(
                batch.map(async ({ handle, path }) => {
                    const file = await handle.getFile();
                    const metadata = await readTrackMetadata(file);
                    return {
                        id: path,
                        path,
                        handle,
                        file: null,
                        artist: metadata.artist,
                        title: metadata.title,
                        label: metadata.artist
                            ? `${metadata.artist} — ${metadata.title}`
                            : metadata.title,
                    };
                }),
            )),
        );
        elements.libraryCount.textContent = `${indexed.length} TRACKS INDEXED…`;
    }

    tracks = indexed.sort((a, b) => a.label.localeCompare(b.label));
    updateLibraryUi(label);
    if (!tracks.length) showError("That folder contains no MP3 files.");
}

async function indexFallbackFiles(files) {
    const mp3Files = [...files].filter(
        (file) =>
            file.type === "audio/mpeg" ||
            file.name.toLowerCase().endsWith(".mp3"),
    );
    const indexed = await Promise.all(
        mp3Files.map(async (file) => {
            const metadata = await readTrackMetadata(file);
            const path = file.webkitRelativePath || file.name;
            return {
                id: path,
                path,
                handle: null,
                file,
                artist: metadata.artist,
                title: metadata.title,
                label: metadata.artist
                    ? `${metadata.artist} — ${metadata.title}`
                    : metadata.title,
            };
        }),
    );
    tracks = indexed.sort((a, b) => a.label.localeCompare(b.label));
    updateLibraryUi("Temporary folder (choose with Chrome to remember it)");
    if (!tracks.length) showError("That folder contains no MP3 files.");
}

async function saveAndIndexHandles(handles, label) {
    rememberedSource = { handles, label };
    try {
        await databasePut(LIBRARY_KEY, rememberedSource);
    } catch (error) {
        console.warn("Could not remember the music handles", error);
    }
    await indexHandles(handles, label);
    elements.reconnectButton.hidden = true;
}

async function chooseFolder() {
    clearError();
    if (!window.showDirectoryPicker) {
        elements.folderFallback.click();
        return;
    }

    try {
        const handle = await window.showDirectoryPicker({
            id: "robot-dj-library",
            mode: "read",
        });
        await saveAndIndexHandles([handle], handle.name);
    } catch (error) {
        if (error.name !== "AbortError")
            showError(`Could not open that folder: ${error.message}`);
    }
}

async function restoreRememberedLibrary() {
    try {
        rememberedSource = await databaseGet(LIBRARY_KEY);
        if (!rememberedSource?.handles?.length) return;
        const permissions = await Promise.all(
            rememberedSource.handles.map((handle) => hasReadPermission(handle)),
        );
        if (permissions.every(Boolean)) {
            await indexHandles(
                rememberedSource.handles,
                rememberedSource.label,
            );
        } else {
            elements.libraryName.textContent = `${rememberedSource.label} is remembered — reconnect to use it`;
            elements.reconnectButton.hidden = false;
        }
    } catch (error) {
        console.warn("Could not restore the remembered library", error);
    }
}

async function reconnectLibrary() {
    if (!rememberedSource?.handles?.length) return;
    const permissions = await Promise.all(
        rememberedSource.handles.map((handle) =>
            hasReadPermission(handle, true),
        ),
    );
    if (!permissions.every(Boolean)) {
        showError(
            "Chrome still needs permission to read the remembered music folder.",
        );
        return;
    }
    await indexHandles(rememberedSource.handles, rememberedSource.label);
    elements.reconnectButton.hidden = true;
}

async function handlesFromDrop(event) {
    const handlePromises = [...event.dataTransfer.items]
        .filter((item) => item.kind === "file" && item.getAsFileSystemHandle)
        .map((item) => item.getAsFileSystemHandle());
    return (await Promise.all(handlePromises)).filter(Boolean);
}

function cameraConstraints(cameraId = selectedCameraId) {
    return {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
    };
}

function stopCamera() {
    for (const track of cameraStream?.getTracks() || []) track.stop();
    cameraStream = null;
    elements.cameraVideo.srcObject = null;
}

async function populateCameraPicker() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    if (cameras.length < 2) {
        elements.cameraPicker.hidden = true;
        return;
    }

    const activeCameraId = cameraStream
        ?.getVideoTracks()[0]
        ?.getSettings().deviceId;
    elements.cameraSelect.replaceChildren(
        ...cameras.map((camera, index) => {
            const option = document.createElement("option");
            option.value = camera.deviceId;
            option.textContent = camera.label || `CAMERA ${index + 1}`;
            return option;
        }),
    );
    elements.cameraSelect.value = activeCameraId || selectedCameraId;
    elements.cameraPicker.hidden = false;
}

async function startCamera() {
    if (cameraStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
            "This browser does not expose a camera API. Use a current Chrome over HTTPS or localhost.",
        );
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: cameraConstraints(),
        });
    } catch (error) {
        if (!selectedCameraId) throw error;
        localStorage.removeItem(CAMERA_STORAGE_KEY);
        selectedCameraId = "";
        cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: cameraConstraints(),
        });
    }
    elements.cameraVideo.srcObject = cameraStream;
    await elements.cameraVideo.play();
    selectedCameraId =
        cameraStream.getVideoTracks()[0]?.getSettings().deviceId || "";
    if (selectedCameraId)
        localStorage.setItem(CAMERA_STORAGE_KEY, selectedCameraId);
    await populateCameraPicker();
    elements.cameraPlaceholder.hidden = true;
    elements.cameraVideo.classList.add("visible");
    elements.cameraLive.classList.add("visible");
    elements.cameraStatus.textContent = "CAMERA LIVE";
}

async function changeCamera() {
    const nextCameraId = elements.cameraSelect.value;
    if (!nextCameraId || nextCameraId === selectedCameraId) return;
    selectedCameraId = nextCameraId;
    localStorage.setItem(CAMERA_STORAGE_KEY, selectedCameraId);
    stopCamera();
    try {
        await startCamera();
    } catch (error) {
        showError(`Could not switch camera: ${error.message}`);
    }
}

async function captureSnapshot() {
    await startCamera();
    if (!elements.cameraVideo.videoWidth) {
        await new Promise((resolve) =>
            elements.cameraVideo.addEventListener("loadedmetadata", resolve, {
                once: true,
            }),
        );
    }

    const maxWidth = 1024;
    const scale = Math.min(1, maxWidth / elements.cameraVideo.videoWidth);
    const width = Math.round(elements.cameraVideo.videoWidth * scale);
    const height = Math.round(elements.cameraVideo.videoHeight * scale);
    elements.snapshotCanvas.width = width;
    elements.snapshotCanvas.height = height;
    elements.snapshotCanvas
        .getContext("2d")
        .drawImage(elements.cameraVideo, 0, 0, width, height);
    latestSnapshot = elements.snapshotCanvas.toDataURL("image/jpeg", 0.72);
    return latestSnapshot;
}

function initializeAudio() {
    if (audioContext) return;
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = Number(elements.volumeInput.value);
    masterGain.connect(audioContext.destination);

    decks = [0, 1].map((index) => {
        const element = new Audio();
        element.preload = "auto";
        const source = audioContext.createMediaElementSource(element);
        const gain = audioContext.createGain();
        gain.gain.value = index === 0 ? 1 : 0;
        source.connect(gain).connect(masterGain);
        element.addEventListener("timeupdate", () => handleTimeUpdate(index));
        element.addEventListener("ended", () => handleTrackEnded(index));
        return {
            element,
            gain,
            track: null,
            objectUrl: null,
            excerptStart: 0,
            excerptEnd: 0,
        };
    });
}

async function fileForTrack(track) {
    return track.handle ? track.handle.getFile() : track.file;
}

async function loadDeck(deck, track) {
    const file = await fileForTrack(track);
    if (!file) throw new Error(`Could not open ${track.label}`);
    if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
    deck.objectUrl = URL.createObjectURL(file);
    deck.track = track;
    deck.element.src = deck.objectUrl;
    deck.element.load();

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`Timed out loading ${track.label}`)),
            10_000,
        );
        const done = () => {
            clearTimeout(timeout);
            resolve();
        };
        const failed = () => {
            clearTimeout(timeout);
            reject(new Error(`Chrome could not decode ${track.label}`));
        };
        deck.element.addEventListener("loadedmetadata", done, { once: true });
        deck.element.addEventListener("error", failed, { once: true });
    });
    deck.excerptStart = deck.element.duration / 3;
    deck.excerptEnd = Math.min(
        deck.element.duration,
        deck.excerptStart + EXCERPT_SECONDS,
    );
    deck.element.currentTime = deck.excerptStart;
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function recentTrackIds() {
    return new Set(
        history.slice(-RECENT_TRACK_COUNT).map((entry) => entry.track.id),
    );
}

function randomUnplayedTrack() {
    const recent = recentTrackIds();
    const eligible = tracks.filter(
        (track) => track.id !== currentTrack?.id && !recent.has(track.id),
    );
    return randomItem(
        eligible.length
            ? eligible
            : tracks.filter((track) => track.id !== currentTrack?.id),
    );
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function updateProgress() {
    if (audioContext && decks.length) {
        const deck = decks[activeDeckIndex];
        const { element } = deck;
        const excerptDuration = deck.excerptEnd - deck.excerptStart;
        const ratio = excerptDuration
            ? (element.currentTime - deck.excerptStart) / excerptDuration
            : 0;
        elements.progressBar.style.width = `${Math.min(100, ratio * 100)}%`;
        elements.elapsedTime.textContent = formatTime(
            element.currentTime - deck.excerptStart,
        );
        elements.durationTime.textContent = formatTime(excerptDuration);
    }
    requestAnimationFrame(updateProgress);
}

function scheduleRoomScan(delay = SNAPSHOT_DELAY_MS) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scanAndSelect(), delay);
}

function onTrackStarted(track) {
    currentTrack = track;
    history.push({ track, startedAt: new Date().toISOString() });
    history = history.slice(-40);
    elements.nowPlaying.textContent = track.label;
    elements.nextTrack.textContent = "WATCHING THE ROOM…";
    elements.nextStatus.textContent = "NEXT SELECTION IN 8 SECONDS";
    elements.nextPanel.classList.remove("is-selected");
    elements.aiStatus.textContent = "NEXT SCAN IN 8 SECONDS";
    elements.pauseButton.textContent = "PAUSE";
    elements.pauseButton.disabled = false;
    elements.skipButton.disabled = false;
    elements.scanButton.disabled = false;
    scheduleTextFit();
    scheduleRoomScan();
}

function fitTextToBox(element, minimumFontSize) {
    element.style.removeProperty("font-size");
    if (!document.body.classList.contains("installation-mode")) return;

    const maximumFontSize = Number.parseFloat(
        getComputedStyle(element).fontSize,
    );
    if (!maximumFontSize || !element.clientHeight || !element.clientWidth)
        return;

    const fits = () =>
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1;
    if (fits()) return;

    let smallestFit = minimumFontSize;
    let largestFit = maximumFontSize;
    element.style.fontSize = `${smallestFit}px`;
    if (!fits()) return;

    while (largestFit - smallestFit > 0.5) {
        const candidate = (smallestFit + largestFit) / 2;
        element.style.fontSize = `${candidate}px`;
        if (fits()) smallestFit = candidate;
        else largestFit = candidate;
    }
    element.style.fontSize = `${smallestFit.toFixed(1)}px`;
}

function fitInstallationText() {
    fitTextToBox(elements.nowPlaying, 12);
    fitTextToBox(elements.roomRead, 20);
    fitTextToBox(elements.nextTrack, 16);
}

function scheduleTextFit() {
    cancelAnimationFrame(textFitFrame);
    textFitFrame = requestAnimationFrame(fitInstallationText);
}

function shortSentence(text, fallback) {
    const clean = String(text || fallback)
        .replace(/\s+/g, " ")
        .trim();
    const firstSentence =
        clean.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || fallback;
    const words = firstSentence.replace(/[.!?]+$/, "").split(" ");
    const shortened =
        words.length > 18
            ? `${words.slice(0, 18).join(" ")}…`
            : words.join(" ");
    return /[.!?…]$/.test(shortened) ? shortened : `${shortened}.`;
}

function formatRobotRead(observation, reason) {
    const visibleRead = shortSentence(
        observation,
        "The camera caught a room keeping its secrets.",
    );
    const songRead = shortSentence(
        reason,
        "The next track follows that visible energy.",
    );
    return `${visibleRead} ${songRead}`;
}

function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function selectionCandidates() {
    const recent = recentTrackIds();
    let eligible = tracks.filter(
        (track) => track.id !== currentTrack?.id && !recent.has(track.id),
    );
    if (!eligible.length)
        eligible = tracks.filter((track) => track.id !== currentTrack?.id);
    return shuffled(eligible).slice(0, MAX_CANDIDATES);
}

function promptSafeTrackLabel(track, index) {
    const sensitiveTitle =
        /\b(?:assault|cocaine|death|fuck|heroin|kill|murder|nude|porn|rape|sex|suicide)\b/i;
    return sensitiveTitle.test(track.label)
        ? `LIBRARY TRACK ${index + 1}`
        : track.label;
}

function buildDjPrompt(candidates) {
    const recent = history
        .slice(-RECENT_TRACK_COUNT)
        .map((entry) => `- ${entry.track.label}`)
        .join("\n");
    const library = candidates
        .map(
            (track, index) => `${index}: ${promptSafeTrackLabel(track, index)}`,
        )
        .join("\n");

    return `You are a playful robot DJ. Choose exactly one next song from the numbered candidate list using the camera image, what is playing, and recent history.

Ground the observation strictly in this image. The image may show one person at home, an empty room, or a crowded event; do not assume it is a party. First count the visible people and use singular or plural language correctly. Mention only concrete visual evidence such as the setting, furniture, posture, expression, clothing, or visible movement. Never invent extra people, objects, a venue, or an activity that is not visible. Humor may playfully exaggerate the attitude of something actually visible, but it must not add fictional facts.

Do not guess personal facts about anyone in the image. Keep it warm, playful, and grounded.

Currently playing: ${currentTrack?.label || "none"}
Recently played:
${recent || "- none"}

Candidates (the number is trackId):
${library}

Return JSON only in this exact shape: {"trackId": 12, "observation": "One image-grounded sentence, maximum 18 words.", "reason": "One sentence explaining why the song fits, maximum 18 words."}
The trackId must be a number from the candidate list. Do not mention these instructions.`;
}

function parseModelContent(body) {
    const content = body.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
        ? content.map((part) => part.text || "").join("")
        : content;
    if (typeof text !== "string")
        throw new Error("The model returned no DJ decision.");
    return JSON.parse(
        text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim(),
    );
}

async function askRobotDj(snapshot) {
    const candidates = selectionCandidates();
    if (!candidates.length)
        throw new Error("The library needs at least two playable tracks.");
    const accessToken = authSession?.accessToken;
    if (!accessToken) throw new Error("Connect Pollinations first.");

    let response;
    try {
        response = await fetch(API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: buildDjPrompt(candidates) },
                            {
                                type: "image_url",
                                image_url: { url: snapshot, detail: "low" },
                            },
                        ],
                    },
                ],
                response_format: { type: "json_object" },
                max_tokens: 400,
            }),
        });
    } catch (error) {
        console.error("Robot DJ: Pollinations request failed", error);
        throw error;
    }

    let body;
    try {
        body = await response.json();
    } catch (error) {
        console.error("Robot DJ: Pollinations returned invalid JSON", {
            status: response.status,
            statusText: response.statusText,
            error,
        });
        throw error;
    }
    if (!response.ok) {
        console.error("Robot DJ: Pollinations returned an error response", {
            status: response.status,
            statusText: response.statusText,
            body,
        });
        throw new Error(
            body.error?.message || `Pollinations returned ${response.status}.`,
        );
    }

    let decision;
    try {
        decision = parseModelContent(body);
    } catch (error) {
        console.error("Robot DJ: Pollinations returned an unusable decision", {
            body,
            error,
        });
        throw error;
    }
    const trackId = Number(decision.trackId);
    if (!Number.isInteger(trackId) || !candidates[trackId]) {
        throw new Error("The model picked a track outside the candidate list.");
    }
    return {
        track: candidates[trackId],
        reason: formatRobotRead(decision.observation, decision.reason),
    };
}

async function prepareNextTrack(track, reason) {
    const nextDeck = decks[1 - activeDeckIndex];
    await loadDeck(nextDeck, track);
    nextDeck.gain.gain.setValueAtTime(0, audioContext.currentTime);
    queuedTrack = { track, reason };
    elements.nextTrack.textContent = track.label;
    elements.nextStatus.textContent = "ROBOT SELECTED · LOCKED FOR TRANSITION";
    elements.nextPanel.classList.add("is-selected");
    elements.roomRead.textContent = reason;
    scheduleTextFit();
    elements.aiStatus.textContent = "NEXT TRACK READY";
}

async function scanAndSelect() {
    if (!djStarted || selectionInFlight || isCrossfading) return;
    clearTimeout(scanTimer);
    selectionInFlight = true;
    clearError();
    elements.thinkingLine.hidden = false;
    elements.aiStatus.textContent = "READING THE ROOM…";
    const trackAtStart = currentTrack;
    let selected = false;

    try {
        const snapshot = await captureSnapshot();
        const decision = await askRobotDj(snapshot);
        if (currentTrack?.id !== trackAtStart?.id) return;
        await prepareNextTrack(decision.track, decision.reason);
        selected = true;
    } catch (error) {
        console.error("Robot DJ: selection attempt failed", {
            currentTrack: trackAtStart?.label,
            error,
        });
        if (currentTrack?.id !== trackAtStart?.id) return;
        elements.nextTrack.textContent = "RETRYING THE ROOM…";
        elements.nextStatus.textContent =
            "NO PICK YET · RETRYING IN 30 SECONDS";
        elements.nextPanel.classList.remove("is-selected");
    } finally {
        selectionInFlight = false;
        elements.thinkingLine.hidden = true;
        if (currentTrack?.id === trackAtStart?.id && !isCrossfading) {
            scheduleRoomScan(RESCAN_INTERVAL_MS);
            elements.aiStatus.textContent = selected
                ? "NEXT READY · READING AGAIN IN 30 SECONDS"
                : "ROOM READ WILL RETRY IN 30 SECONDS";
        }
    }
}

async function startCrossfade(seconds = CROSSFADE_SECONDS) {
    if (isCrossfading || !queuedTrack) return;
    isCrossfading = true;
    clearTimeout(scanTimer);
    elements.pauseButton.disabled = true;
    elements.aiStatus.textContent = "CROSSFADING…";

    const oldIndex = activeDeckIndex;
    const oldDeck = decks[oldIndex];
    const nextDeck = decks[1 - oldIndex];
    const now = audioContext.currentTime;
    const duration = Math.max(0.15, seconds);

    nextDeck.element.currentTime = nextDeck.excerptStart;
    try {
        await nextDeck.element.play();
    } catch (error) {
        isCrossfading = false;
        elements.pauseButton.disabled = false;
        elements.aiStatus.textContent = "CROSSFADE FAILED";
        showError(
            `Could not play ${queuedTrack.track.label}: ${error.message}`,
        );
        return;
    }
    oldDeck.gain.gain.cancelScheduledValues(now);
    nextDeck.gain.gain.cancelScheduledValues(now);
    oldDeck.gain.gain.setValueAtTime(oldDeck.gain.gain.value, now);
    nextDeck.gain.gain.setValueAtTime(0, now);
    oldDeck.gain.gain.linearRampToValueAtTime(0, now + duration);
    nextDeck.gain.gain.linearRampToValueAtTime(1, now + duration);

    setTimeout(() => finishCrossfade(oldIndex), duration * 1000 + 80);
}

function finishCrossfade(oldIndex) {
    if (!isCrossfading || activeDeckIndex !== oldIndex || !queuedTrack) return;
    const oldDeck = decks[oldIndex];
    const newIndex = 1 - oldIndex;
    const newDeck = decks[newIndex];
    const selected = queuedTrack;

    oldDeck.element.pause();
    oldDeck.element.currentTime = 0;
    oldDeck.gain.gain.setValueAtTime(0, audioContext.currentTime);
    newDeck.gain.gain.setValueAtTime(1, audioContext.currentTime);
    activeDeckIndex = newIndex;
    queuedTrack = null;
    isCrossfading = false;
    elements.roomRead.textContent = selected.reason;
    onTrackStarted(selected.track);
}

async function loadRandomBackupAndFade(seconds) {
    if (fallbackLoading || queuedTrack) return;
    fallbackLoading = true;
    try {
        const fallback = randomUnplayedTrack();
        if (!fallback) return;
        await prepareNextTrack(
            fallback,
            "Emergency shuffle engaged: the room gets mystery meat, but make it musical.",
        );
        await startCrossfade(seconds);
    } catch (error) {
        showError(error.message);
    } finally {
        fallbackLoading = false;
    }
}

function handleTimeUpdate(index) {
    if (index !== activeDeckIndex || isCrossfading) return;
    const element = decks[index].element;
    if (!Number.isFinite(element.duration)) return;
    const remaining = decks[index].excerptEnd - element.currentTime;
    if (queuedTrack && remaining <= CROSSFADE_SECONDS) {
        startCrossfade(Math.min(CROSSFADE_SECONDS, Math.max(0.2, remaining)));
    } else if (!queuedTrack && remaining <= 1.5) {
        loadRandomBackupAndFade(0.3);
    }
}

function handleTrackEnded(index) {
    if (index !== activeDeckIndex) return;
    if (isCrossfading) finishCrossfade(index);
    else if (queuedTrack) startCrossfade(0.15);
    else loadRandomBackupAndFade(0.15);
}

async function skipTrack() {
    if (!djStarted || isCrossfading) return;
    if (!queuedTrack) {
        const fallback = randomUnplayedTrack();
        if (!fallback) return;
        await prepareNextTrack(
            fallback,
            "A human touched the controls. Democracy is terrifying.",
        );
    }
    await startCrossfade(2);
}

async function togglePause() {
    if (!djStarted || isCrossfading) return;
    const element = decks[activeDeckIndex].element;
    if (element.paused) {
        await element.play();
        elements.pauseButton.textContent = "PAUSE";
    } else {
        element.pause();
        elements.pauseButton.textContent = "PLAY";
    }
}

async function startDj() {
    clearError();
    if (tracks.length < 2) {
        showError("Choose a folder with at least two MP3 files.");
        return;
    }
    if (!authSession) {
        showError(
            "Connect Pollinations so the robot can spend your approved Pollen budget.",
        );
        elements.connectButton.focus();
        return;
    }

    elements.startButton.disabled = true;
    elements.startButton.textContent = "WAKING THE ROBOT…";

    try {
        await startCamera();
        initializeAudio();
        await audioContext.resume();
        const openingTrack = randomItem(tracks);
        await loadDeck(decks[0], openingTrack);
        decks[0].gain.gain.setValueAtTime(0, audioContext.currentTime);
        await decks[0].element.play();
        decks[0].gain.gain.linearRampToValueAtTime(
            1,
            audioContext.currentTime + 1.2,
        );
        djStarted = true;
        document.body.classList.add("installation-mode");
        elements.startButton.textContent = "ROBOT DJ IS RUNNING";
        elements.roomRead.textContent =
            "The opening track is a blind draw. Eight seconds in, then every thirty seconds, the robot opens one digital eye and updates its read.";
        onTrackStarted(openingTrack);
    } catch (error) {
        updateStartButtonState();
        elements.startButton.textContent = "START ROBOT DJ";
        showError(`Could not start: ${error.message}`);
    }
}

elements.chooseFolderButton.addEventListener("click", (event) => {
    event.stopPropagation();
    chooseFolder();
});
elements.dropZone.addEventListener("click", (event) => {
    if (event.target === elements.dropZone || event.target.closest("div"))
        chooseFolder();
});
elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chooseFolder();
    }
});
elements.folderFallback.addEventListener("change", () =>
    indexFallbackFiles(elements.folderFallback.files),
);
elements.reconnectButton.addEventListener("click", reconnectLibrary);
elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
});
elements.dropZone.addEventListener("dragleave", () =>
    elements.dropZone.classList.remove("dragging"),
);
elements.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    try {
        const handles = await handlesFromDrop(event);
        if (handles.length) {
            const label =
                handles.length === 1
                    ? handles[0].name
                    : `${handles.length} dropped items`;
            await saveAndIndexHandles(handles, label);
        } else {
            await indexFallbackFiles(event.dataTransfer.files);
        }
    } catch (error) {
        showError(`Could not read the dropped music: ${error.message}`);
    }
});

elements.startButton.addEventListener("click", startDj);
elements.connectButton.addEventListener("click", connectPollinations);
elements.disconnectButton.addEventListener("click", disconnectPollinations);
elements.scanButton.addEventListener("click", scanAndSelect);
elements.cameraSelect.addEventListener("change", changeCamera);
elements.skipButton.addEventListener("click", skipTrack);
elements.pauseButton.addEventListener("click", togglePause);
elements.volumeInput.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = Number(elements.volumeInput.value);
});
elements.fullscreenButton.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
});

window.addEventListener("beforeunload", () => {
    clearTimeout(scanTimer);
    for (const deck of decks) {
        deck.element.pause();
        if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
    }
    stopCamera();
});
window.addEventListener("resize", scheduleTextFit);

updateProgress();
updateAuthUi();

async function initialize() {
    try {
        await handleOauthCallback();
    } catch (error) {
        showError(error.message);
    }
    updateAuthUi();
    await restoreRememberedLibrary();
    scheduleTextFit();
}

initialize();
