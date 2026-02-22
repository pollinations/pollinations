import React, { useState, useEffect } from 'react';

interface StylePanelProps {
  projectPrompt: string;
  imageUrl: string;
  onProjectPromptChange: (prompt: string) => void;
  onImageUrlChange: (url: string) => void;
}

const StylePanel: React.FC<StylePanelProps> = ({
  projectPrompt,
  imageUrl,
  onProjectPromptChange,
  onImageUrlChange
}) => {
  const [localPrompt, setLocalPrompt] = useState(projectPrompt);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!isTyping) {
      setLocalPrompt(projectPrompt);
    }
  }, [projectPrompt, isTyping]);

  useEffect(() => {
    if (!isTyping) return;
    const timeout = setTimeout(() => {
      onProjectPromptChange(localPrompt);
      setIsTyping(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [localPrompt, isTyping, onProjectPromptChange]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <textarea
        value={localPrompt}
        onChange={(e) => { setLocalPrompt(e.target.value); setIsTyping(true); }}
        className="flex-1 min-h-0 w-full resize-none border border-transparent bg-gray-900/60 rounded-xl p-4 font-mono text-sm text-gray-200 placeholder:text-gray-600 focus:bg-gray-900/80 focus:border-gray-600 focus:outline-none transition-colors"
        placeholder="Define the vibe, style & rules for your image generation..."
        spellCheck={false}
      />
      <input
        type="url"
        value={imageUrl}
        onChange={(e) => onImageUrlChange(e.target.value)}
        className="flex-shrink-0 w-full h-10 border border-transparent bg-gray-900/60 rounded-xl px-4 text-sm text-gray-200 placeholder:text-gray-600 focus:bg-gray-900/80 focus:border-gray-600 focus:outline-none transition-colors"
        placeholder="Reference image URL..."
        spellCheck={false}
      />
    </div>
  );
};

export default StylePanel;
