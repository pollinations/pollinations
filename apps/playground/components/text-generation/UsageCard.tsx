'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageModelV3Usage } from '@ai-sdk/provider';
import type { LanguageModelUsage } from 'ai';

interface UsageCardProps {
  usage: LanguageModelUsage | ImageModelV3Usage;
  title?: string;
  cardTitle?: string;
  showSectionTitle?: boolean;
}

export function UsageCard({
  usage,
  title = 'Usage',
  cardTitle = 'Token Usage',
  showSectionTitle = false,
}: UsageCardProps) {
  return (
    <div className="space-y-4">
      {showSectionTitle && (
        <div>
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
        </div>
      )}
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="text-base">{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input Tokens:</span>
              <span className="font-medium">
                {usage.inputTokens?.toLocaleString() ?? 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output Tokens:</span>
              <span className="font-medium">
                {usage.outputTokens?.toLocaleString() ?? 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tokens:</span>
              <span className="font-medium">
                {usage.totalTokens?.toLocaleString() ?? 'N/A'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
