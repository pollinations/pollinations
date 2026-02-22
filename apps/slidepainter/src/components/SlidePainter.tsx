import React, { useState, useEffect, useRef } from 'react';
import { usePollenImagePool, useAuth } from '../hooks';
import { ImageConfigClient } from '../utils';
import { exportSlidesPdf } from '../utils/pdfExport';
import { MarkdownConfigParser } from '../utils/markdownConfigParser';
import type { ClientImageConfig, RenderSize } from '../utils';
import AuthPanel from './AuthPanel';
import ImagePreview from './ImagePreview';
import RenderSizeSelector from './RenderSizeSelector';
import SlideList from './SlideList';
import StylePanel from './StylePanel';

const SlidePainter: React.FC = () => {
  const auth = useAuth();

  const {
    getCurrentImage,
    regenerateImage,
    isGenerating,
    getError,
    reinitializePool
  } = usePollenImagePool({ apiToken: auth.apiKey, model: auth.selectedModel });

  const [config, setConfig] = useState<ClientImageConfig | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'slides' | 'style'>('slides');

  // Load configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        localStorage.removeItem('myceli-image-config');
        const loadedConfig = await ImageConfigClient.load();
        setConfig(loadedConfig);

        if (!Array.isArray(loadedConfig.sections)) {
          console.error('Config sections is not an array after migration');
          return;
        }

        const orderedSections = loadedConfig.sections.sort((a, b) => a.order - b.order);
        if (orderedSections[0]) {
          setCurrentSectionId(orderedSections[0].id);
        }
      } catch (error) {
        console.error('Failed to load image config:', error);
      }
    };
    loadConfig();
  }, []);

  const reloadConfig = async () => {
    const loadedConfig = await ImageConfigClient.load();
    setConfig(loadedConfig);
    return loadedConfig;
  };

  // --- Handlers ---

  const handleDescriptionChange = async (sectionId: string, description: string) => {
    try {
      await ImageConfigClient.updateSection(sectionId, { description: description.trim() });
      if (config) {
        const newConfig = { ...config };
        const idx = newConfig.sections.findIndex(s => s.id === sectionId);
        if (idx !== -1) {
          newConfig.sections[idx] = { ...newConfig.sections[idx], description: description.trim() };
          setConfig(newConfig);
        }
      }
    } catch (error) {
      console.error('Failed to save description:', error);
    }
  };

  const handleSystemPromptChange = async (prompt: string) => {
    try {
      await ImageConfigClient.updateProject(prompt);
      if (config) {
        setConfig({ ...config, project: prompt });
      }
    } catch (error) {
      console.error('Failed to save system prompt:', error);
    }
  };

  const handleImageUrlChange = async (url: string) => {
    try {
      await ImageConfigClient.updateImageUrl(url);
      if (config) {
        setConfig({ ...config, imageUrl: url });
      }
    } catch (error) {
      console.error('Failed to save image URL:', error);
    }
  };

  const handleDownload = async () => {
    if (!config) return;
    try {
      // Export markdown config
      const md = MarkdownConfigParser.configToMarkdown(config);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'slides.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Export PDF (only if there are images)
      const hasImages = config.sections.some(s => {
        const imgs = config.imageSelections[s.id];
        return imgs && imgs.length > 0 && imgs[0];
      });
      if (hasImages) {
        await exportSlidesPdf(config);
      }
    } catch (error) {
      console.error('Failed to download:', error);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isProcessing) return;
    setIsProcessing(true);
    try {
      const text = await file.text();
      const parsed = MarkdownConfigParser.parseMarkdown(text);
      const imported: ClientImageConfig = {
        sections: parsed.sections,
        imageSelections: parsed.imageSelections,
        project: parsed.projectPrompt,
        imageUrl: parsed.imageInputUrl,
      };
      localStorage.setItem('myceli-image-config', JSON.stringify(imported));
      setConfig(imported);
      const ordered = [...imported.sections].sort((a, b) => a.order - b.order);
      if (ordered[0]) setCurrentSectionId(ordered[0].id);
      await reinitializePool();
    } catch (error) {
      console.error('Failed to import config:', error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetConfig = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await ImageConfigClient.resetConfig();
      const loadedConfig = await reloadConfig();
      const orderedSections = loadedConfig.sections.sort((a, b) => a.order - b.order);
      if (orderedSections[0]) {
        setCurrentSectionId(orderedSections[0].id);
      }
      await reinitializePool();
    } catch (error) {
      console.error('Failed to reset config:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSection = async (afterSectionId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const newSectionId = await ImageConfigClient.addSection(afterSectionId);
      await reloadConfig();
      setCurrentSectionId(newSectionId);
      await reinitializePool();
    } catch (error) {
      console.error('Failed to add section:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (isProcessing || !config || config.sections.length <= 1) return;
    setIsProcessing(true);
    try {
      const focusSectionId = await ImageConfigClient.deleteSection(sectionId);
      const loadedConfig = await reloadConfig();
      setCurrentSectionId(focusSectionId || loadedConfig.sections[0]?.id || '');
    } catch (error) {
      console.error('Failed to delete section:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveSection = async (sectionId: string, direction: 'up' | 'down') => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await ImageConfigClient.moveSection(sectionId, direction === 'up' ? 'left' : 'right');
      await reloadConfig();
    } catch (error) {
      console.error('Failed to move section:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenderSizeChange = async (newSize: RenderSize) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await ImageConfigClient.updateSection(currentSectionId, { renderSize: newSize });
      if (config) {
        const newConfig = { ...config };
        const idx = newConfig.sections.findIndex(s => s.id === currentSectionId);
        if (idx !== -1) {
          newConfig.sections[idx] = { ...newConfig.sections[idx], renderSize: newSize };
          setConfig(newConfig);
        }
      }
    } catch (error) {
      console.error('Failed to update render size:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = () => {
    const section = config?.sections.find(s => s.id === currentSectionId);
    regenerateImage(currentSectionId, section?.description);
  };

  // --- Derived state ---

  const generating = isGenerating(currentSectionId);
  const currentImage = getCurrentImage(currentSectionId);
  const currentError = getError(currentSectionId);
  const currentSection = config?.sections.find(s => s.id === currentSectionId);

  if (!config) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-400">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-[#0f0f13] flex-grow h-screen flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col">
      {/* Main content — fills viewport */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 px-4 py-4">
        {/* Left: Image Canvas — takes most of the screen */}
        <div className="flex-1 min-w-0 min-h-0">
          <ImagePreview
            imageUrl={currentImage?.url || null}
            isGenerating={generating}
            error={currentError}
          />
        </div>

        {/* Right: Tabbed Panel — fixed width sidebar */}
        <div className="w-full md:w-[360px] md:flex-shrink-0 flex flex-col min-h-0">
          {/* Auth Panel */}
          <div className="flex-shrink-0 mb-3">
            <AuthPanel auth={auth} />
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-2 mb-3 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isProcessing}
                className="py-2 rounded-lg text-sm text-gray-400 bg-gray-900/60 border border-gray-700/50 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-30"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="py-2 rounded-lg text-sm text-gray-400 bg-gray-900/60 border border-gray-700/50 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-30"
              >
                Import
              </button>
              <button
                type="button"
                onClick={handleResetConfig}
                disabled={isProcessing}
                className="py-2 rounded-lg text-sm text-gray-400 bg-gray-900/60 border border-gray-700/50 hover:text-red-400 hover:border-red-700/50 transition-colors disabled:opacity-30"
              >
                Reset
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md"
                onChange={handleImport}
                className="hidden"
              />
            </div>

            <RenderSizeSelector
              currentSize={currentSection?.renderSize || '1024x1024'}
              onSizeChange={handleRenderSizeChange}
              isDisabled={generating || isProcessing}
              className="w-full"
            />

            <div className="flex gap-2">
              {auth.models.length > 0 && (
                <select
                  value={auth.selectedModel}
                  onChange={(e) => auth.setSelectedModel(e.target.value)}
                  className="flex-1 min-w-0 py-2 px-3 text-sm bg-gray-900/60 text-gray-200 border border-gray-700/50 rounded-lg outline-none focus:border-gray-600 transition-colors"
                >
                  {auth.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || isProcessing}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  generating || isProcessing
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-500 active:scale-95'
                }`}
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-1 mb-3 bg-gray-800/40 rounded-xl p-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('slides')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'slides'
                  ? 'bg-gray-700/80 text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Slides
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'style'
                  ? 'bg-gray-700/80 text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Style
            </button>
          </div>

          {/* Tab Content — scrollable, no visible scrollbar */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
            {activeTab === 'slides' ? (
              <SlideList
                sections={config.sections}
                selectedSectionId={currentSectionId}
                onSelectSection={setCurrentSectionId}
                onUpdateDescription={handleDescriptionChange}
                onAddSection={handleAddSection}
                onDeleteSection={handleDeleteSection}
                onMoveSection={handleMoveSection}
                isProcessing={isProcessing}
              />
            ) : (
              <StylePanel
                projectPrompt={config.project || ''}
                imageUrl={config.imageUrl || ''}
                onProjectPromptChange={handleSystemPromptChange}
                onImageUrlChange={handleImageUrlChange}
              />
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default SlidePainter;
