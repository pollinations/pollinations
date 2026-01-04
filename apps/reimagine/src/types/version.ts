export interface VersionResponse {
    version: string;
}

export interface VersionCheckResult {
    currentVersion: string;
    latestVersion: string;
    needsUpdate: boolean;
    error?: string;
}
