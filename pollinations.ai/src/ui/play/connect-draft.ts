// File objects can be structured-cloned by IndexedDB. Keep the lookup key in
// this tab, and consume the files once Play returns from the OAuth redirect.
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

async function editDrafts(edit: (store: IDBObjectStore) => void) {
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
                    edit(store);
                }
            };
        });
    } finally {
        db.close();
    }
}

export async function saveConnectDraft<T>(draft: T) {
    const id = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, id);
    await editDrafts((store) =>
        store.put({ draft, expires: Date.now() + lifetime }, id),
    );
}

export async function takeConnectDraft<T>(): Promise<T | undefined> {
    const id = sessionStorage.getItem(key);
    if (!id) return;
    let draft: T | undefined;
    await editDrafts((store) => {
        const request = store.get(id);
        request.onsuccess = () => {
            if (request.result?.expires > Date.now())
                draft = request.result.draft;
            store.delete(id);
        };
    });
    sessionStorage.removeItem(key);
    return draft;
}
