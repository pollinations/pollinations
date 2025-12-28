import axios from 'axios';
import { VersionResponse, VersionCheckResult } from '../types/version';
import Constants from 'expo-constants';


export const getConfig = () => {
  const { VERSION_URL } = Constants.expoConfig.extra;
  return { VERSION_URL };
};


class VersionService {

  private static readonly VERSION_URL = getConfig().VERSION_URL;
  private static readonly REQUEST_TIMEOUT = 10000;


  private getCurrentVersion(): string {
    // get version from manifest Expo
    return Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
  }


  private compareVersions(currentVersion: string, latestVersion: string): boolean {
    const current = currentVersion.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const currentPart = current[i] || 0;
      const latestPart = latest[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false; // Versions identiques
  }


  async checkForUpdate(): Promise<VersionCheckResult> {
    try {
      const currentVersion = this.getCurrentVersion();
      console.log("passage checkForUpdate")
      // Add random parameter to bypass cache
      const randomParam = Math.random().toString(36).substring(7);
      const urlWithParam = `${VersionService.VERSION_URL}?t=${randomParam}`;
      
      const response = await axios.get<VersionResponse>(urlWithParam, {
        timeout: VersionService.REQUEST_TIMEOUT,
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      const latestVersion = response.data.version;
      console.log("passage checkForUpdate latestVersion", latestVersion)
      console.log("passage checkForUpdate currentVersion", currentVersion)
      const needsUpdate = this.compareVersions(currentVersion, latestVersion);

      return {
        currentVersion,
        latestVersion,
        needsUpdate,
      };
    } catch (error) {
      console.error('Error checking version:', error);
      
      const currentVersion = this.getCurrentVersion();
      return {
        currentVersion,
        latestVersion: currentVersion,
        needsUpdate: false,
        error: error instanceof Error ? error.message : 'Connection error',
      };
    }
  }

  /**
   * Open  Google Play Store to donwload last version
   */
  async openPlayStore(packageName: string = 'com.ismafly.promptexploratorapp') {
    const playStoreUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
    
    try {
      // Import dynamique pour éviter les erreurs si Linking n'est pas disponible
      const { Linking } = await import('react-native');
      await Linking.openURL(playStoreUrl);
    } catch (error) {
      console.error('Error opening Play Store:', error);
      // Fallback : ouvrir dans le navigateur web
      if (typeof window !== 'undefined') {
        window.open(playStoreUrl, '_blank');
      }
    }
  }
}

export default new VersionService();