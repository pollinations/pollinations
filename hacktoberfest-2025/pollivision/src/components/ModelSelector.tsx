import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Zap,
  Clock,
  Sparkles,
  Check,
  Info,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { VIDEO_MODELS, calculateVideoCost, formatPollenCost } from '../constants/videoModels';

interface ModelSelectorProps {
  compact?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { settings, setSettings } = useStore();

  const selectedModel = VIDEO_MODELS.find((m) => m.id === settings.selectedVideoModel) || VIDEO_MODELS[0];
  const estimatedCost = calculateVideoCost(selectedModel.id, settings.videoDuration);

  const handleSelectModel = (modelId: string) => {
    setSettings({ selectedVideoModel: modelId });
    setIsOpen(false);
  };

  const handleDurationChange = (duration: number) => {
    setSettings({ videoDuration: Math.max(1, Math.min(30, duration)) });
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-700 border border-white/10 hover:border-pollen-500/30 transition-all text-sm"
        >
          <span>{selectedModel.icon}</span>
          <span className="text-gray-300">{selectedModel.name}</span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <CompactDropdown
              selectedModel={selectedModel}
              onSelect={handleSelectModel}
              onClose={() => setIsOpen(false)}
              duration={settings.videoDuration}
              onDurationChange={handleDurationChange}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <label className="text-sm text-gray-400 mb-2 block">Video Model</label>
        <div className="grid grid-cols-1 gap-2">
          {VIDEO_MODELS.map((model) => {
            const isSelected = model.id === settings.selectedVideoModel;
            const cost = calculateVideoCost(model.id, settings.videoDuration);

            return (
              <button
                key={model.id}
                onClick={() => handleSelectModel(model.id)}
                className={`p-4 rounded-xl border transition-all text-left ${
                  isSelected
                    ? 'bg-pollen-500/20 border-pollen-500/50'
                    : 'bg-dark-700/50 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{model.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{model.name}</span>
                        {model.recommended && (
                          <span className="px-2 py-0.5 rounded-full bg-pollen-500/20 text-pollen-400 text-xs">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{model.description}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock size={12} />
                          {model.speed}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Sparkles size={12} />
                          {model.quality}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 text-pollen-400 font-semibold">
                      <Zap size={14} />
                      <span>{formatPollenCost(cost)}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      for {settings.videoDuration}s
                    </span>
                    {isSelected && (
                      <Check size={16} className="text-pollen-400 mt-1" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Video Duration</label>
          <span className="text-sm text-pollen-400 font-medium">{settings.videoDuration} seconds</span>
        </div>
        <input
          type="range"
          min="1"
          max="30"
          value={settings.videoDuration}
          onChange={(e) => handleDurationChange(parseInt(e.target.value))}
          className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer accent-pollen-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1s</span>
          <span>15s</span>
          <span>30s</span>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="p-4 rounded-xl bg-pollen-500/10 border border-pollen-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Estimated Cost</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl">{selectedModel.icon}</span>
              <span className="text-gray-300">{selectedModel.name}</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">{settings.videoDuration}s</span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-2xl text-pollen-400 font-bold">
              <Zap size={24} />
              <span>{formatPollenCost(estimatedCost)}</span>
            </div>
            <span className="text-xs text-gray-500">polens</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Compact Dropdown Component
const CompactDropdown: React.FC<{
  selectedModel: typeof VIDEO_MODELS[0];
  onSelect: (id: string) => void;
  onClose: () => void;
  duration: number;
  onDurationChange: (duration: number) => void;
}> = ({ selectedModel, onSelect, onClose, duration, onDurationChange }) => {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        className="absolute top-full left-0 mt-2 w-80 z-50 glass rounded-xl overflow-hidden shadow-xl"
      >
        {/* Duration Quick Select */}
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Duration</span>
            <span className="text-xs text-pollen-400 font-medium">{duration}s</span>
          </div>
          <div className="flex gap-2">
            {[5, 10, 15, 20].map((d) => (
              <button
                key={d}
                onClick={() => onDurationChange(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  duration === d
                    ? 'bg-pollen-500 text-dark-900'
                    : 'bg-dark-600 text-gray-400 hover:bg-dark-500'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Models List */}
        <div className="max-h-64 overflow-y-auto p-2">
          {VIDEO_MODELS.map((model) => {
            const isSelected = model.id === selectedModel.id;
            const cost = calculateVideoCost(model.id, duration);

            return (
              <button
                key={model.id}
                onClick={() => onSelect(model.id)}
                className={`w-full p-3 rounded-lg transition-all text-left flex items-center justify-between ${
                  isSelected
                    ? 'bg-pollen-500/20'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{model.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{model.name}</span>
                      {model.recommended && (
                        <span className="px-1.5 py-0.5 rounded bg-pollen-500/20 text-pollen-400 text-[10px]">
                          ★
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{model.quality} • {model.speed}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-pollen-400 font-medium text-sm">
                  <Zap size={12} />
                  <span>{formatPollenCost(cost)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Info Footer */}
        <div className="p-3 border-t border-white/5 bg-dark-800/50">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-500">
              Video generation is in <span className="text-pollen-400">alpha 🧪</span>. 
              Costs may vary based on complexity.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ModelSelector;



