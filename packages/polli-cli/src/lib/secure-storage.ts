import keytar from "keytar";

const SERVICE_NAME = "pollinations-cli";
let _secureStorageInitialized = false;

export async function initSecureStorage(): Promise<void> {
    // keytar is optional; if it fails, we fall back to file-based storage
    _secureStorageInitialized = true;
}

export async function setSecureCredential(account: string, password: string): Promise<boolean> {
    try {
        await keytar.setPassword(SERVICE_NAME, account, password);
        return true;
    } catch {
        return false;
    }
}

export async function getSecureCredential(account: string): Promise<string | null> {
    try {
        return await keytar.getPassword(SERVICE_NAME, account);
    } catch {
        return null;
    }
}

export async function deleteSecureCredential(account: string): Promise<boolean> {
    try {
        return await keytar.deletePassword(SERVICE_NAME, account);
    } catch {
        return false;
    }
}

export async function listSecureCredentials(): Promise<string[]> {
    try {
        return await keytar.findCredentials(SERVICE_NAME);
    } catch {
        return [];
    }
}