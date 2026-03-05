'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';

// Dynamically import react-json-view only on client side
const ReactJson = dynamic(
  () => import('react-json-view'),
  { ssr: false }
) as any;

interface JsonResultProps {
  title?: string;
  value?: unknown;
  placeholder?: string;
}

export function JsonResult({
  title = 'Result',
  value,
  placeholder = 'No result yet. Submit a prompt to see the output.',
}: JsonResultProps) {
  const [isClient, setIsClient] = useState(false);
  const hasValue = value !== undefined && value !== null;

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      </div>
      <div className="rounded-md border bg-muted/50 p-4 min-h-[200px]">
        {hasValue && isClient ? (
          <ReactJson
            src={value as any}
            name={false}
            collapsed={1}
            enableClipboard={false}
            displayDataTypes={false}
            displayObjectSize={false}
            theme="rjv-default"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.8rem',
              lineHeight: 1.4,
              overflow: 'auto',
            }}
          />
        ) : hasValue ? (
          <pre className="text-xs overflow-auto rounded bg-background/80 p-2 border">
            {JSON.stringify(value, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
    </div>
  );
}
