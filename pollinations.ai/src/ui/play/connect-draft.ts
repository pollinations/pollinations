import type { PlaySearch } from "../../routes/-play-search";

type Category = "image" | "video" | "audio";
type TabDraft<T> = {
    params: PlaySearch;
    referenceImages: T[];
    videoReferences: Record<Category, T[]>;
    audioFiles: T[];
};
export type ConnectDrafts<T = File> = Partial<Record<Category, TabDraft<T>>>;

type StoredFile = {
    bytes: ArrayBuffer;
    name: string;
    type: string;
    lastModified: number;
};

// WebKit private sessions can store ArrayBuffers in IndexedDB but reject Files.
async function mapFiles<T, R>(
    drafts: ConnectDrafts<T>,
    convert: (file: T) => R | Promise<R>,
): Promise<ConnectDrafts<R>> {
    const result: ConnectDrafts<R> = {};
    const map = (files: T[]) => Promise.all(files.map(convert));
    for (const category of ["image", "video", "audio"] as const) {
        const draft = drafts[category];
        if (!draft) continue;
        result[category] = {
            params: draft.params,
            referenceImages: await map(draft.referenceImages),
            videoReferences: {
                image: await map(draft.videoReferences.image),
                video: await map(draft.videoReferences.video),
                audio: await map(draft.videoReferences.audio),
            },
            audioFiles: await map(draft.audioFiles),
        };
    }
    return result;
}

// Keep the lookup key in this tab and consume the draft once after the redirect.
const key = "play-connect-draft";
const lifetime = 30 * 60 * 1000;

async function openDrafts(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(key, 1);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore("drafts");
            store.createIndex("expires", "expires");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function editDrafts(edit?: (store: IDBObjectStore) => void) {
    const db = await openDrafts();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("drafts", "readwrite");
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error);
            const store = transaction.objectStore("drafts");
            const expired = store
                .index("expires")
                .openKeyCursor(IDBKeyRange.upperBound(Date.now()));
            expired.onsuccess = () => {
                const cursor = expired.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                } else {
                    edit?.(store);
                }
            };
        });
    } finally {
        db.close();
    }
}

export async function saveConnectDraft(files: ConnectDrafts) {
    const draft = await mapFiles(files, async (file) => ({
        bytes: await file.arrayBuffer(),
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
    }));
    const id = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, id);
    await editDrafts((store) =>
        store.put({ draft, expires: Date.now() + lifetime }, id),
    );
}

export async function takeConnectDraft(): Promise<ConnectDrafts | undefined> {
    const id = sessionStorage.getItem(key);
    if (!id) {
        // A closed consent tab loses its session key. Sweep its expired files
        // on the next visit without making a fresh playground wait for storage.
        void editDrafts().catch(() => {});
        return;
    }
    let draft: ConnectDrafts<StoredFile> | undefined;
    await editDrafts((store) => {
        const request = store.get(id);
        request.onsuccess = () => {
            if (request.result?.expires > Date.now())
                draft = request.result.draft;
            store.delete(id);
        };
    });
    sessionStorage.removeItem(key);
    return (
        draft &&
        mapFiles(
            draft,
            (file) =>
                new File([file.bytes], file.name, {
                    type: file.type,
                    lastModified: file.lastModified,
                }),
        )
    );
}
