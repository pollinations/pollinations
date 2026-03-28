import { useRef, useEffect, useState } from 'react';
import { Message } from '@/types';

// --- BYOP Auth (following CatGPT pattern) ---

const AUTH_KEY = 'pollinations_api_key';
const ENTER = 'https://enter.pollinations.ai';

export const getStoredApiKey = (): string | null => {
  try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
};
const storeApiKey = (key: string) => localStorage.setItem(AUTH_KEY, key);
const clearApiKey = () => localStorage.removeItem(AUTH_KEY);

function extractApiKeyFromFragment(): string | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  try {
    const key = new URLSearchParams(hash).get('api_key');
    return key && /^(sk_|plln_pk_|pk_)/.test(key) ? key : null;
  } catch { return null; }
}

function getAuthorizeUrl(): string {
  const redirect = window.location.href.split('#')[0];
  return `${ENTER}/authorize?${new URLSearchParams({ redirect_url: redirect })}`;
}

export const useBYOP = () => {
  const [apiKey, setApiKey] = useState<string | null>(getStoredApiKey);

  useEffect(() => {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    storeApiKey(key);
    setApiKey(key);
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }, []);

  const login = () => { window.location.href = getAuthorizeUrl(); };
  const logout = () => { clearApiKey(); setApiKey(null); };

  return { apiKey, login, logout };
};

// --- UI Hooks ---

// Scroll management hook
export const useMessageScroll = (messages: Message[]) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  return ref;
};

// Input focus management hook
export const useInput = (isLoading: boolean) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isLoading && ref.current) {
      ref.current.focus();
    }
  }, [isLoading]);
  return { inputRef: ref };
};
