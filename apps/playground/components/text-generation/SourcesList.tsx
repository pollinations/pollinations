'use client';

interface SourcesListProps {
  sources: any[];
  title?: string;
}

export function SourcesList({ sources, title = 'Sources' }: SourcesListProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      </div>
      <div className="rounded-md border bg-muted/50 p-4">
        <ul className="space-y-2 text-sm">
          {sources.map((source: any, index: number) => (
            <li key={source.id ?? source.url ?? index} className="flex gap-2">
              <span className="text-muted-foreground">{index + 1}.</span>
              {source.sourceType === 'url' && source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {source.url}
                </a>
              ) : (
                <span className="text-muted-foreground">
                  {source.url ?? JSON.stringify(source)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
