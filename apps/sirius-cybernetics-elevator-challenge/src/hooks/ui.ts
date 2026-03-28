import { useRef, useEffect, useState } from 'react';
import { Message } from '@/types';

const AUTH_KEY = 'pollinations_api_key';
const ENTER_URL = 'https://enter.pollinations.ai';
const API_KEY_PREFIX = /^(sk_|plln_pk_|pk_)/;

export function getStoredApiKey(): string | null {
  try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
}

function storeApiKey(key: string): void {
  localStorage.setItem(AUTH_KEY, key);
}

function clearApiKey(): void {
  localStorage.removeItem(AUTH_KEY);
}

function extractApiKeyFromFragment(): string | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  try {
    const key = new URLSearchParams(hash).get('api_key');
    return key && API_KEY_PREFIX.test(key) ? key : null;
  } catch { return null; }
}

function getAuthorizeUrl(): string {
  const redirect = window.location.href.split('#')[0];
  return `${ENTER_URL}/authorize?${new URLSearchParams({ redirect_url: redirect })}`;
}

export function useBYOP() {
  const [apiKey, setApiKey] = useState<string | null>(getStoredApiKey);

  useEffect(() => {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    storeApiKey(key);
    setApiKey(key);
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }, []);

  function login() { window.location.href = getAuthorizeUrl(); }
  function logout() { clearApiKey(); setApiKey(null); }

  return { apiKey, login, logout };
}

// UI Hooks

export function useMessageScroll(messages: Message[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  return ref;
}

export function useInput(isLoading: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isLoading && ref.current) {
      ref.current.focus();
    }
  }, [isLoading]);
  return { inputRef: ref };
}
