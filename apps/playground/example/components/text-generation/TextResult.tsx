'use client';

import ReactMarkdown from 'react-markdown';

interface TextResultProps {
  title?: string;
  text?: string;
  placeholder?: string;
}

export function TextResult({
  title = 'Result',
  text,
  placeholder = 'No result yet. Submit a prompt to see the output.',
}: TextResultProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      </div>
      <div className="rounded-md border bg-muted/50 p-4 min-h-[200px]">
        {text ? (
          <div className="text-sm whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
    </div>
  );
}
