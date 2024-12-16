import { memo } from 'react';
import { Markdown } from './Markdown';
import { USAGE_REGEX } from '~/utils/constants';

interface AssistantMessageProps {
  content: string;
}

export const AssistantMessage = memo(({ content }: AssistantMessageProps) => {
  const match = content.match(USAGE_REGEX);
  const usage = match ? JSON.parse(match[1]) : null;
  const cleanContent = content.replace(USAGE_REGEX, '').trim();

  return (
    <div className="overflow-hidden w-full">
      {usage && (
        <div className="text-sm text-bolt-elements-textSecondary mb-2">
          Tokens: {usage.totalTokens} (prompt: {usage.promptTokens}, completion: {usage.completionTokens})
        </div>
      )}
      <Markdown html>{cleanContent}</Markdown>
    </div>
  );
});
