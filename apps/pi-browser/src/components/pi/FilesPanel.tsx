"use client";

/**
 * Live workspace file tree + file viewer, backed by the sandbox filesystem.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileJson,
  FileText,
  FolderOpen,
  Folder,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileNode } from "@/lib/types";
import type { PiWorkspace } from "@/lib/pi-browser";

interface FilesPanelProps {
  workspace: PiWorkspace | null;
  filesVersion: number;
}

function byteLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function TreeNode({
  node,
  depth,
  onOpen,
  openPath,
}: {
  node: FileNode;
  depth: number;
  onOpen: (node: FileNode) => void;
  openPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.kind === "directory") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-pollen/80" aria-hidden />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-pollen/80" aria-hidden />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpen={onOpen}
              openPath={openPath}
            />
          ))}
      </div>
    );
  }

  const lower = node.name.toLowerCase();
  const isJson = lower.endsWith(".json");
  const isText = lower.endsWith(".md") || lower.endsWith(".txt");
  const active = openPath === node.path;
  return (
    <button
      type="button"
      onClick={() => onOpen(node)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
        active ? "bg-pollen/15 text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {isJson ? (
        <FileJson className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : isText ? (
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <FileIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{node.name}</span>
      {node.size != null && (
        <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">{byteLabel(node.size)}</span>
      )}
    </button>
  );
}

export function FilesPanel({ workspace, filesVersion }: FilesPanelProps) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspace?.ready) return;
    setLoading(true);
    try {
      setTree(await workspace.listWorkspaceFiles());
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    if (workspace?.ready) void refresh();
  }, [workspace, filesVersion, refresh]);

  const open = useCallback(
    async (node: FileNode) => {
      if (!workspace?.ready) return;
      setFileError(null);
      try {
        const content = await workspace.readWorkspaceFile(node.path);
        setOpenFile({ path: node.path, content });
      } catch (error) {
        setFileError(error instanceof Error ? error.message : String(error));
        setOpenFile(null);
      }
    },
    [workspace]
  );

  const totalFiles = (function count(nodes: FileNode[]): number {
    return nodes.reduce(
      (sum, node) => sum + (node.kind === "file" ? 1 : count(node.children ?? [])),
      0
    );
  })(tree ?? []);

  return (
    <div className="flex w-full min-w-0 flex-col bg-card/30">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          /workspace · {totalFiles} files
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 w-7 p-0"
          onClick={() => void refresh()}
          aria-label="Refresh file tree"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {tree == null ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading workspace…
          </div>
        ) : tree.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">The workspace is empty.</p>
        ) : (
          tree.map((node) => (
            <TreeNode key={node.path} node={node} depth={0} onOpen={open} openPath={openFile?.path ?? null} />
          ))
        )}
      </div>

      {/* ---------- file viewer ---------- */}
      {openFile && (
        <div className="flex h-[55%] min-h-0 shrink-0 flex-col border-t">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
            <span className="truncate font-mono text-[11px] text-foreground">{openFile.path}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 w-6 p-0 text-muted-foreground"
              onClick={() => setOpenFile(null)}
              aria-label="Close file"
            >
              ✕
            </Button>
          </div>
          <pre className="slim-scroll min-h-0 flex-1 overflow-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            {openFile.content}
          </pre>
        </div>
      )}
      {fileError && (
        <p className="border-t p-3 text-xs text-destructive">{fileError}</p>
      )}
    </div>
  );
}
