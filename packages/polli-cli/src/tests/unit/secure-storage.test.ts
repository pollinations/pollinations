import { describe, it, expect, beforeEach, vi } from "vitest";

// keytar mock
const mockKeytar = {
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
    findCredentials: vi.fn(),
};

vi.mock("keytar", () => ({
    default: mockKeytar,
    setPassword: mockKeytar.setPassword,
    getPassword: mockKeytar.getPassword,
    deletePassword: mockKeytar.deletePassword,
    findCredentials: mockKeytar.findCredentials,
}));

const {
    initSecureStorage,
    setSecureCredential,
    getSecureCredential,
    deleteSecureCredential,
    listSecureCredentials,
} = await import("../../lib/secure-storage.js");

describe("secure-storage", () => {
    const SERVICE = "pollinations-cli";
    const ACCOUNT = "api-key";
    const PASSWORD = "sk_test_abc123";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("initSecureStorage", () => {
        it("should initialize without errors", async () => {
            await expect(initSecureStorage()).resolves.toBeUndefined();
        });
    });

    describe("setSecureCredential", () => {
        it("should store a credential using keytar", async () => {
            mockKeytar.setPassword.mockResolvedValue(undefined);
            const result = await setSecureCredential(ACCOUNT, PASSWORD);
            expect(result).toBe(true);
            expect(mockKeytar.setPassword).toHaveBeenCalledWith(SERVICE, ACCOUNT, PASSWORD);
        });

        it("should return false on failure", async () => {
            mockKeytar.setPassword.mockRejectedValue(new Error("keytar unavailable"));
            const result = await setSecureCredential(ACCOUNT, PASSWORD);
            expect(result).toBe(false);
        });
    });

    describe("getSecureCredential", () => {
        it("should retrieve a stored credential", async () => {
            mockKeytar.getPassword.mockResolvedValue(PASSWORD);
            const result = await getSecureCredential(ACCOUNT);
            expect(result).toBe(PASSWORD);
            expect(mockKeytar.getPassword).toHaveBeenCalledWith(SERVICE, ACCOUNT);
        });

        it("should return null when credential does not exist", async () => {
            mockKeytar.getPassword.mockResolvedValue(null);
            const result = await getSecureCredential(ACCOUNT);
            expect(result).toBeNull();
        });

        it("should return null on error", async () => {
            mockKeytar.getPassword.mockRejectedValue(new Error("dbus error"));
            const result = await getSecureCredential(ACCOUNT);
            expect(result).toBeNull();
        });
    });

    describe("deleteSecureCredential", () => {
        it("should delete a credential successfully", async () => {
            mockKeytar.deletePassword.mockResolvedValue(true);
            const result = await deleteSecureCredential(ACCOUNT);
            expect(result).toBe(true);
            expect(mockKeytar.deletePassword).toHaveBeenCalledWith(SERVICE, ACCOUNT);
        });

        it("should return false when credential does not exist", async () => {
            mockKeytar.deletePassword.mockResolvedValue(false);
            const result = await deleteSecureCredential(ACCOUNT);
            expect(result).toBe(false);
        });

        it("should return false on error", async () => {
            mockKeytar.deletePassword.mockRejectedValue(new Error("operation failed"));
            const result = await deleteSecureCredential(ACCOUNT);
            expect(result).toBe(false);
        });
    });

    describe("listSecureCredentials", () => {
        it("should list all credentials for the service", async () => {
            const creds = [
                { account: "api-key", password: "sk_abc" },
                { account: "other-key", password: "sk_xyz" },
            ];
            mockKeytar.findCredentials.mockResolvedValue(creds);
            const result = await listSecureCredentials();
            expect(result).toEqual(creds);
            expect(mockKeytar.findCredentials).toHaveBeenCalledWith(SERVICE);
        });

        it("should return empty array on error", async () => {
            mockKeytar.findCredentials.mockRejectedValue(new Error("access denied"));
            const result = await listSecureCredentials();
            expect(result).toEqual([]);
        });

        it("should return empty array when no credentials exist", async () => {
            mockKeytar.findCredentials.mockResolvedValue([]);
            const result = await listSecureCredentials();
            expect(result).toEqual([]);
        });
    });
});
