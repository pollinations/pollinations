import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pollinations_api_key';
const ENTER_URL = 'https://enter.pollinations.ai';
const API_BASE = 'https://gen.pollinations.ai';

const isValidApiKey = (token: string): boolean =>
  typeof token === 'string' && /^(sk_|plln_pk_|pk_)/.test(token);

export interface UserProfile {
  name: string | null;
  email: string | null;
  githubUsername: string | null;
  tier: string;
}

export interface ImageModel {
  id: string;
  name?: string;
  description?: string;
}

export interface UseAuthReturn {
  apiKey: string | null;
  isLoggedIn: boolean;
  profile: UserProfile | null;
  balance: number | null;
  isLoading: boolean;
  models: ImageModel[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  login: () => void;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [userApiKey, setUserApiKey] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('gptimage');

  // Extract API key from URL fragment on mount (redirect from enter.pollinations.ai)
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    try {
      const hashParams = new URLSearchParams(hash);
      const key = hashParams.get('api_key');

      if (key && isValidApiKey(key)) {
        localStorage.setItem(STORAGE_KEY, key);
        setUserApiKey(key);
        // Clean URL fragment
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
    } catch (error) {
      console.error('Error parsing URL fragment for API key:', error);
    }
  }, []);

  // Fetch profile, balance, and models when logged in
  useEffect(() => {
    if (!userApiKey) {
      setProfile(null);
      setBalance(null);
      setModels([]);
      return;
    }

    const headers = { Authorization: `Bearer ${userApiKey}` };

    const loadAccountData = async () => {
      setIsLoading(true);

      const [profileRes, balanceRes, modelsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/account/profile`, { headers }),
        fetch(`${API_BASE}/account/balance`, { headers }),
        fetch(`${API_BASE}/image/models`, { headers }),
      ]);

      // Profile
      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        try {
          const data = await profileRes.value.json();
          setProfile({
            name: data.name || null,
            email: data.email || null,
            githubUsername: data.githubUsername || null,
            tier: data.tier || 'unknown',
          });
        } catch { /* ignore */ }
      }

      // Balance
      if (balanceRes.status === 'fulfilled' && balanceRes.value.ok) {
        try {
          const data = await balanceRes.value.json();
          setBalance(typeof data.balance === 'number' ? data.balance : null);
        } catch { /* ignore */ }
      }

      // Image models
      if (modelsRes.status === 'fulfilled' && modelsRes.value.ok) {
        try {
          const data = await modelsRes.value.json();
          const imageModels: ImageModel[] = Array.isArray(data)
            ? data.map((m: { id?: string; name?: string; description?: string }) => ({
                id: m.id || m.name || 'unknown',
                name: m.name || m.id,
                description: m.description,
              }))
            : [];
          setModels(imageModels);

          // Default to gptimage if available, otherwise first model
          if (imageModels.length > 0) {
            const hasGptimage = imageModels.some(m => m.id === 'gptimage');
            if (!hasGptimage) {
              setSelectedModel(imageModels[0].id);
            }
          }
        } catch { /* ignore */ }
      }

      setIsLoading(false);
    };

    loadAccountData();
  }, [userApiKey]);

  const login = useCallback(() => {
    const currentUrl = window.location.href.split('#')[0];
    const authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}&permissions=profile,balance`;
    window.location.href = authUrl;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUserApiKey(null);
    setProfile(null);
    setBalance(null);
    setModels([]);
  }, []);

  return {
    apiKey: userApiKey,
    isLoggedIn: !!userApiKey,
    profile,
    balance,
    isLoading,
    models,
    selectedModel,
    setSelectedModel,
    login,
    logout,
  };
}
