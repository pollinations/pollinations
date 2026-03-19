import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const TOKEN_KEY = 'POLLINATIONS_API_TOKEN';

// required for web browser redirect
WebBrowser.maybeCompleteAuthSession();

export class AuthService {
  /**
   * Returns the stored token, if any.
   */
  static async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (e) {
      console.error('Error reading token from SecureStore', e);
      return null;
    }
  }

  /**
   * Saves the token securely.
   */
  static async saveToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch (e) {
      console.error('Error saving token to SecureStore', e);
    }
  }

  /**
   * Clears the token.
   */
  static async clearToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch (e) {
      console.error('Error clearing token', e);
    }
  }

  /**
   * Initiates the BYOP (Bring Your Own Pollen) flow via WebBrowser.
   */
  static async loginWithPollinations(): Promise<string | null> {
    try {
      const redirectUrl = Linking.createURL('auth');
      // Create the authorization URL
      const params = new URLSearchParams({
        redirect_url: redirectUrl,
        app_key: 'pk_reimagine', // identifying the app optionally
      });
      const authUrl = `https://enter.pollinations.ai/authorize?${params.toString()}`;

      // Open the browser for auth
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Parse the token from the fragment
        // The URL typically comes back as reimagine://auth#api_key=sk_...
        const urlObj = new URL(result.url.replace('#', '?'));
        const token = urlObj.searchParams.get('api_key');
        
        if (token) {
          await this.saveToken(token);
          return token;
        }
      }
      return null;
    } catch (e) {
      console.error('Error during BYOP login flow:', e);
      return null;
    }
  }
}
