'use client';

import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, LogOut } from 'lucide-react';

export function AuthStatus() {
  const { apiKey, setApiKey } = usePollinationsApiKey();

  const handleDisconnect = () => {
    setApiKey(null);
    // Redirect to auth to get a new key
    const currentUrl = window.location.href.split('#')[0];
    window.location.href = `https://enter.pollinations.ai/authorize?redirect_url=${encodeURIComponent(currentUrl)}&permissions=profile,balance,usage`;
  };

  if (!apiKey) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  // Mask the API key for display (show first 7 and last 4 characters)
  const maskedKey =
    apiKey.length > 11
      ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`
      : '••••••••';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-muted-foreground">Authenticated</span>
        <span className="font-mono text-xs text-muted-foreground/70">
          {maskedKey}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        className="h-8 text-xs"
      >
        <LogOut className="h-3 w-3 mr-1" />
        Re-authenticate
      </Button>
    </div>
  );
}
