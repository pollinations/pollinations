'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createContext, useContext, useEffect, useState } from 'react';

interface PollinationsApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
}

const PollinationsApiKeyContext = createContext<
  PollinationsApiKeyContextType | undefined
>(undefined);

export function usePollinationsApiKey() {
  const context = useContext(PollinationsApiKeyContext);
  if (context === undefined) {
    // During SSR/build, return a default value instead of throwing
    if (typeof window === 'undefined') {
      return { apiKey: null, setApiKey: () => {} };
    }
    throw new Error(
      'usePollinationsApiKey must be used within a PollinationsApiKeyProvider',
    );
  }
  return context;
}

const STORAGE_KEY = 'pollinations_api_key';

export function PollinationsApiKeyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check for environment variable first
  const envKey =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_POLLINATIONS_API_KEY
      : null;

  // Initialize from localStorage if available
  const getStoredKey = () => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const [apiKey, setApiKeyState] = useState<string | null>(
    envKey || getStoredKey() || null,
  );
  const [isChecking, setIsChecking] = useState(true);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // If we already have an API key (from env), skip auth flow
    if (envKey) {
      setIsChecking(false);
      return;
    }

    // Extract API key from URL fragment (after redirect from auth)
    const hash = window.location.hash.slice(1); // Remove #
    const params = new URLSearchParams(hash);
    const apiKeyFromUrl = params.get('api_key');

    if (apiKeyFromUrl) {
      // Store the API key in both state and localStorage
      setApiKeyState(apiKeyFromUrl);
      try {
        localStorage.setItem(STORAGE_KEY, apiKeyFromUrl);
      } catch {
        // Ignore localStorage errors
      }

      // Clean up URL by removing the hash fragment
      const newUrl = window.location.href.split('#')[0];
      window.history.replaceState({}, '', newUrl);

      setIsChecking(false);
      setShowAuthDialog(false);
    } else {
      setIsChecking(false);
      // Show dialog if no API key found
      if (!apiKey) {
        setShowAuthDialog(true);
      }
    }
  }, [apiKey, envKey]);

  const handleAuthenticate = () => {
    if (typeof window === 'undefined') return;
    const currentUrl = window.location.href.split('#')[0]; // Remove any existing hash
    const authUrl = `https://enter.pollinations.ai/authorize?redirect_url=${encodeURIComponent(currentUrl)}&permissions=profile,balance,usage`;
    window.location.href = authUrl;
  };

  const setApiKey = (key: string | null) => {
    setApiKeyState(key);
    // Update localStorage when key is set
    if (typeof window !== 'undefined') {
      try {
        if (key) {
          localStorage.setItem(STORAGE_KEY, key);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  };

  // Show loading state while checking
  if (isChecking) {
    return (
      <PollinationsApiKeyContext.Provider value={{ apiKey, setApiKey }}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">
              Connecting to Pollinations...
            </p>
          </div>
        </div>
      </PollinationsApiKeyContext.Provider>
    );
  }

  return (
    <PollinationsApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
      <Dialog open={showAuthDialog} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              You need to authenticate with Pollinations before you can use this
              application. You will be redirected to the Pollinations
              authorization page to complete the authentication process.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleAuthenticate} className="w-full sm:w-auto">
              Continue to Pollinations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PollinationsApiKeyContext.Provider>
  );
}
