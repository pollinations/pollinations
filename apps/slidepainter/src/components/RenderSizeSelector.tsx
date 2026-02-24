import React from 'react';
import { RenderSize, RENDER_SIZE_PRESETS } from '../utils/clientImageConfig';

interface RenderSizeSelectorProps {
  currentSize: RenderSize;
  onSizeChange: (size: RenderSize) => void;
  isDisabled?: boolean;
  className?: string;
}

const RenderSizeSelector: React.FC<RenderSizeSelectorProps> = ({
  currentSize,
  onSizeChange,
  isDisabled = false,
  className = ''
}) => {
  return (
    <select
      value={currentSize}
      onChange={(e) => onSizeChange(e.target.value as RenderSize)}
      disabled={isDisabled}
      className={`text-sm rounded-lg border py-2 px-3 transition-colors ${className} ${
        isDisabled
          ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
          : 'bg-gray-900/60 text-gray-200 border-gray-700/50 outline-none focus:border-gray-600'
      }`}
    >
      {Object.entries(RENDER_SIZE_PRESETS).map(([size, preset]) => (
        <option key={size} value={size}>
          {preset.label} ({preset.aspectRatio})
        </option>
      ))}
    </select>
  );
};

export default RenderSizeSelector;
