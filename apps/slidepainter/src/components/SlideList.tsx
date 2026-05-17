import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientImageSection } from '../utils/clientImageConfig';

interface SlideListProps {
  sections: ClientImageSection[];
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onUpdateDescription: (id: string, desc: string) => void;
  onAddSection: (afterId: string) => void;
  onDeleteSection: (id: string) => void;
  onMoveSection: (id: string, direction: 'up' | 'down') => void;
  isProcessing: boolean;
}

const SlideCard: React.FC<{
  section: ClientImageSection;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateDescription: (desc: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canDelete: boolean;
  isProcessing: boolean;
}> = ({ section, index, isSelected, onSelect, onUpdateDescription, onDelete, onMoveUp, onMoveDown, canDelete, isProcessing }) => {
  const [localDesc, setLocalDesc] = useState(section.description);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external changes (section switch, config reset)
  useEffect(() => {
    if (!isTyping) {
      setLocalDesc(section.description);
    }
  }, [section.description, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localDesc]);

  // Debounced save
  useEffect(() => {
    if (!isTyping) return;
    const timeout = setTimeout(() => {
      onUpdateDescription(localDesc);
      setIsTyping(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [localDesc, isTyping, onUpdateDescription]);

  const handleChange = useCallback((value: string) => {
    setLocalDesc(value);
    setIsTyping(true);
  }, []);

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-brand-pink/60 bg-gray-800/80 shadow-md shadow-brand-pink/10'
          : 'border-gray-700/50 bg-gray-800/40 hover:border-gray-600/60 hover:bg-gray-800/60'
      }`}
    >
      <div className="p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Slide {index + 1}</span>
            {/* Action buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={isProcessing}
                className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 disabled:opacity-30"
                title="Move up"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={isProcessing}
                className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 disabled:opacity-30"
                title="Move down"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  disabled={isProcessing}
                  className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/30 disabled:opacity-30"
                  title="Delete slide"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={localDesc}
            onChange={(e) => handleChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-sm text-gray-300 placeholder:text-gray-600 resize-none outline-none overflow-hidden leading-relaxed"
            placeholder="Describe this slide..."
            rows={2}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

const SlideList: React.FC<SlideListProps> = ({
  sections,
  selectedSectionId,
  onSelectSection,
  onUpdateDescription,
  onAddSection,
  onDeleteSection,
  onMoveSection,
  isProcessing
}) => {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const lastSectionId = sorted[sorted.length - 1]?.id;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((section, index) => (
        <div key={section.id} className="group/card">
          <SlideCard
            section={section}
            index={index}
            isSelected={section.id === selectedSectionId}
            onSelect={() => onSelectSection(section.id)}
            onUpdateDescription={(desc) => onUpdateDescription(section.id, desc)}
            onDelete={() => onDeleteSection(section.id)}
            onMoveUp={() => onMoveSection(section.id, 'up')}
            onMoveDown={() => onMoveSection(section.id, 'down')}
            canDelete={sections.length > 1}
            isProcessing={isProcessing}
          />
        </div>
      ))}

      {/* Add Slide Button */}
      <button
        type="button"
        onClick={() => lastSectionId && onAddSection(lastSectionId)}
        disabled={isProcessing}
        className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-gray-700/50 text-gray-500 text-sm hover:border-gray-600 hover:text-gray-400 hover:bg-gray-800/30 transition-all duration-200 disabled:opacity-30"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Slide
      </button>
    </div>
  );
};

export default SlideList;
