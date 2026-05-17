/**
 * Client-side image configuration manager for Vite React app
 * Loads config from Markdown or JSON sources and uses localStorage for persistence
 */

import { MarkdownConfigParser } from './markdownConfigParser';

export type RenderSize = '1024x1024' | '1024x1536' | '1536x1024';

export const RENDER_SIZE_PRESETS: Record<RenderSize, { width: number; height: number; label: string; aspectRatio: string }> = {
  '1024x1024': { width: 1024, height: 1024, label: 'Square (1024×1024)', aspectRatio: '1:1' },
  '1024x1536': { width: 1024, height: 1536, label: 'Portrait (1024×1536)', aspectRatio: '2:3' },
  '1536x1024': { width: 1536, height: 1024, label: 'Landscape (1536×1024)', aspectRatio: '3:2' }
};

export interface ClientImageSection {
  id: string; // UUID for stable identification
  order: number; // Display order (0, 1, 2, 3...)
  description: string; // Combined prompt text for image generation
  active: boolean; // Whether this section is included in the presentation
  renderSize: RenderSize; // Image dimensions for generation
}

export interface ClientImageConfig {
  sections: ClientImageSection[]; // Array of sections ordered by 'order' field
  imageSelections: Record<string, string[]>; // Keyed by section.id
  project: string;
  imageUrl?: string; // Optional image URL for image-to-image generation
}

const CONFIG_URL = '/image-generation-config.md';
const IMAGES_URL = '/image-generation-images.json';
const STORAGE_KEY = 'myceli-image-config';
const CONFIG_VERSION = '2.0'; // Increment this to force localStorage reset
const VERSION_KEY = 'myceli-config-version';

export class ClientImageConfigManager {
  private config: ClientImageConfig | null = null;

  /**
   * Load configuration from Markdown file - always reset on page reload
   */
  async loadConfig(): Promise<ClientImageConfig> {
    try {
      console.log('Loading config from Markdown file:', CONFIG_URL);
      const response = await fetch(CONFIG_URL);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }
      
      const markdownContent = await response.text();
      console.log('Markdown content loaded, length:', markdownContent.length);
      console.log('First 200 chars:', markdownContent.substring(0, 200));
      
      const parsedConfig = MarkdownConfigParser.parseMarkdown(markdownContent);
      console.log('Parsed config:', parsedConfig);
      
      // Use image selections from Markdown first, then fallback to companion file and localStorage
      const imageSelections: Record<string, string[]> = { ...parsedConfig.imageSelections };
      
      // If no images in Markdown, try companion JSON file and localStorage
      if (Object.keys(imageSelections).length === 0) {
        // Try companion JSON file first
        const companionImages = await this.loadImagesFromCompanionFile();
        
        // Try localStorage for session edits
        try {
          const existingConfig = localStorage.getItem(STORAGE_KEY);
          if (existingConfig) {
            const parsed = JSON.parse(existingConfig);
            const oldImageSelections = parsed.imageSelections || {};
            
            // Map section IDs directly - try exact ID match first, then order-based for backward compatibility
            for (const section of parsedConfig.sections) {
              // Try direct ID match first (current format)
              if (oldImageSelections[section.id]) {
                imageSelections[section.id] = oldImageSelections[section.id];
                console.log(`Mapped images from localStorage using direct ID ${section.id}`);
              } else {
                // Fallback to order-based mapping for old format
                const oldSectionId = `section-${String(section.order + 1).padStart(3, '0')}`;
                
                if (oldImageSelections[oldSectionId]) {
                  imageSelections[section.id] = oldImageSelections[oldSectionId];
                  console.log(`Mapped images from localStorage ${oldSectionId} to ${section.id}`);
                } else if (companionImages[oldSectionId]) {
                  imageSelections[section.id] = companionImages[oldSectionId];
                  console.log(`Mapped images from companion file ${oldSectionId} to ${section.id}`);
                }
              }
            }
            
            console.log('Successfully preserved existing image URLs from localStorage and companion file');
          } else {
            // No localStorage, use companion file data
            for (const section of parsedConfig.sections) {
              const oldSectionId = `section-${String(section.order + 1).padStart(3, '0')}`;
              if (companionImages[oldSectionId]) {
                imageSelections[section.id] = companionImages[oldSectionId];
                console.log(`Mapped images from companion file ${oldSectionId} to ${section.id}`);
              }
            }
          }
        } catch (storageError) {
          console.warn('Could not load existing image URLs from localStorage:', storageError);
          
          // Fallback to companion file only
          for (const section of parsedConfig.sections) {
            const oldSectionId = `section-${String(section.order + 1).padStart(3, '0')}`;
            if (companionImages[oldSectionId]) {
              imageSelections[section.id] = companionImages[oldSectionId];
              console.log(`Mapped images from companion file ${oldSectionId} to ${section.id}`);
            }
          }
        }
        
        // Also try to load from the old JSON file for backward compatibility
        try {
          const jsonResponse = await fetch('/image-generation-config.json');
          if (jsonResponse.ok) {
            const jsonConfig = await jsonResponse.json();
            const jsonImageSelections = jsonConfig.imageSelections || {};
            
            // Map JSON section IDs to new section IDs and merge (lowest priority)
            for (const section of parsedConfig.sections) {
              const jsonSectionId = `section-${String(section.order + 1).padStart(3, '0')}`;
              if (jsonImageSelections[jsonSectionId] && !imageSelections[section.id]) {
                imageSelections[section.id] = jsonImageSelections[jsonSectionId];
                console.log(`Loaded images from old JSON ${jsonSectionId} to ${section.id}`);
              }
            }
            
            console.log('Successfully loaded images from old JSON file');
          }
        } catch (jsonError) {
          console.warn('Could not load images from old JSON file (expected if deleted):', jsonError);
        }
      } else {
        console.log('Using image URLs directly from Markdown file');
      }
      
      // Detect and fix corrupted state where all sections have identical images
      const imageLists = Object.values(imageSelections);
      if (imageLists.length > 1) {
        const firstList = JSON.stringify(imageLists[0]);
        const allIdentical = imageLists.every(list => JSON.stringify(list) === firstList);
        
        if (allIdentical && imageLists[0]?.length > 0) {
          console.warn('🔧 Detected corrupted state: all sections have identical images. Clearing to prevent duplication bug.');
          // Keep only the first section's images, clear the rest
          const sectionIds = Object.keys(imageSelections);
          for (let i = 1; i < sectionIds.length; i++) {
            imageSelections[sectionIds[i]] = [];
          }
          console.log('✅ Cleaned up corrupted imageSelections');
        }
      }
      
      this.config = {
        sections: parsedConfig.sections,
        imageSelections: imageSelections,
        project: parsedConfig.projectPrompt,
        imageUrl: parsedConfig.imageInputUrl
      };
      
      console.log('Successfully loaded config from Markdown file with preserved images');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      return this.config!;
    } catch (error) {
      throw new Error(`Failed to load image configuration: ${error}`);
    }
  }


  /**
   * Save configuration to localStorage and companion JSON file
   */
  async saveConfig(config: ClientImageConfig): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      this.config = config;
      
      // Also save images to companion JSON file
      await this.saveImagesToCompanionFile(config.imageSelections);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  /**
   * Get current configuration (loads if not cached, uses localStorage for session edits)
   */
  async getConfig(): Promise<ClientImageConfig> {
    if (!this.config) {
      // Check version - if mismatch, clear localStorage
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion !== CONFIG_VERSION) {
        console.log(`🔄 Config version changed (${storedVersion} → ${CONFIG_VERSION}), clearing localStorage`);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('myceli-companion-images');
        localStorage.setItem(VERSION_KEY, CONFIG_VERSION);
      }
      
      // Try localStorage first for session edits, fallback to original file
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          this.config = JSON.parse(stored);
          // Migrate sections without renderSize field
          this.config = this.migrateConfigForRenderSize(this.config!);
          console.log('Loading config from localStorage (session edits)');
          return this.config!;
        } catch {
          console.warn('Invalid stored config, loading from original Markdown file');
        }
      }
      await this.loadConfig();
    }
    return this.config!;
  }

  /**
   * Update a specific section
   */
  async updateSection(sectionId: string, sectionData: Partial<ClientImageSection>): Promise<void> {
    const config = await this.getConfig();
    
    const sectionIndex = config.sections.findIndex(section => section.id === sectionId);
    if (sectionIndex === -1) {
      throw new Error(`Section ${sectionId} does not exist`);
    }
    
    config.sections[sectionIndex] = {
      ...config.sections[sectionIndex],
      ...sectionData
    };
    
    await this.saveConfig(config);
  }

  /**
   * Replace all images in a section
   */
  async replaceImagesInSection(sectionId: string, imageUrls: string[]): Promise<void> {
    const config = await this.getConfig();
    config.imageSelections[sectionId] = imageUrls;
    await this.saveConfig(config);
  }

  /**
   * Update project prompt
   */
  async updateProject(project: string): Promise<void> {
    const config = await this.getConfig();
    config.project = project;
    await this.saveConfig(config);
  }

  /**
   * Update image URL for image-to-image generation
   */
  async updateImageUrl(imageUrl: string): Promise<void> {
    const config = await this.getConfig();
    config.imageUrl = imageUrl;
    await this.saveConfig(config);
  }

  /**
   * Reset to original configuration
   */
  async resetConfig(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    this.config = null;
    await this.loadConfig();
  }

  /**
   * Add a new section after the specified section and renumber all sections sequentially
   */
  async addSection(afterSectionId: string): Promise<string> {
    const config = await this.getConfig();
    const sectionIndex = config.sections.findIndex(section => section.id === afterSectionId);
    
    if (sectionIndex === -1) {
      throw new Error(`Section ${afterSectionId} not found`);
    }

    // Create new section with default values
    const newSectionId = crypto.randomUUID();
    const newSection: ClientImageSection = {
      id: newSectionId,
      order: sectionIndex + 1,
      description: '🆕 New Section - Edit this section - A minimalist design with clean lines and soft colors - Add your content here',
      active: true, // New sections are active by default
      renderSize: '1024x1024' // Default to square format
    };

    // Insert new section after the current one and renumber all sections sequentially
    config.sections.splice(sectionIndex + 1, 0, newSection);
    config.sections.forEach((section, index) => section.order = index);
    
    await this.saveConfig(config);
    
    return newSection.id;
  }

  /**
   * Delete a section and renumber all sections to maintain sequential order
   */
  async deleteSection(sectionId: string): Promise<string | null> {
    const config = await this.getConfig();
    const sectionIndex = config.sections.findIndex(section => section.id === sectionId);
    
    if (sectionIndex === -1) {
      throw new Error(`Section ${sectionId} not found`);
    }
    
    // Don't delete if it's the only section
    if (config.sections.length === 1) {
      throw new Error('Cannot delete the last section');
    }

    // Remove the section and its images
    config.sections.splice(sectionIndex, 1);
    delete config.imageSelections[sectionId];
    
    // Renumber all sections to maintain sequential order (0, 1, 2, 3...)
    config.sections.forEach((section, index) => section.order = index);
    
    await this.saveConfig(config);
    
    // Return the new ID of the section to focus on
    if (sectionIndex > 0) {
      return config.sections[sectionIndex - 1].id; // Previous section
    } else if (config.sections.length > 0) {
      return config.sections[0].id; // First section
    }
    return null;
  }

  /**
   * Move a section in the specified direction
   */
  async moveSection(sectionId: string, direction: 'left' | 'right'): Promise<void> {
    const config = await this.getConfig();
    const sectionIndex = config.sections.findIndex(section => section.id === sectionId);
    
    if (sectionIndex === -1) {
      throw new Error(`Section ${sectionId} not found`);
    }
    
    // Circular movement - wrap around at boundaries
    let targetIndex: number;
    if (direction === 'left') {
      targetIndex = sectionIndex === 0 ? config.sections.length - 1 : sectionIndex - 1;
    } else {
      targetIndex = sectionIndex === config.sections.length - 1 ? 0 : sectionIndex + 1;
    }
    
    // Swap positions
    [config.sections[sectionIndex], config.sections[targetIndex]] = [config.sections[targetIndex], config.sections[sectionIndex]];
    
    // Update order
    config.sections.forEach((section, index) => section.order = index);
    
    await this.saveConfig(config);
  }

  /**
   * Save image selections to companion JSON file
   * Maps new section IDs back to old format for compatibility
   */
  private async saveImagesToCompanionFile(imageSelections: Record<string, string[]>): Promise<void> {
    try {
      const config = await this.getConfig();
      const companionData: Record<string, string[]> = {};
      
      // Map new section IDs back to old format (section-001, section-002, etc.)
      for (const section of config.sections) {
        const oldSectionId = `section-${String(section.order + 1).padStart(3, '0')}`;
        if (imageSelections[section.id] && imageSelections[section.id].length > 0) {
          companionData[oldSectionId] = imageSelections[section.id];
        }
      }
      
      // Note: In a real application, this would need a server endpoint to write files
      // For now, we'll log the data that should be saved
      console.log('Image data to save to companion file:', JSON.stringify(companionData, null, 2));
      
      // Store in a special localStorage key for companion file sync
      localStorage.setItem('myceli-companion-images', JSON.stringify(companionData));
      
    } catch (error) {
      console.warn('Failed to save images to companion file:', error);
    }
  }

  /**
   * Load images from companion JSON file
   */
  private async loadImagesFromCompanionFile(): Promise<Record<string, string[]>> {
    try {
      // First try to load from the actual JSON file
      const response = await fetch(IMAGES_URL);
      if (response.ok) {
        const companionData = await response.json();
        console.log('Loaded images from companion JSON file');
        return companionData;
      }
    } catch (error) {
      console.warn('Could not load companion images file:', error);
    }
    
    // Fallback to localStorage companion data
    try {
      const stored = localStorage.getItem('myceli-companion-images');
      if (stored) {
        const companionData = JSON.parse(stored);
        console.log('Loaded images from localStorage companion data');
        return companionData;
      }
    } catch (error) {
      console.warn('Could not load companion images from localStorage:', error);
    }
    
    return {};
  }

  /**
   * Migrate configuration to add renderSize field to sections that don't have it
   */
  private migrateConfigForRenderSize(config: ClientImageConfig): ClientImageConfig {
    let migrated = false;
    const migratedSections = config.sections.map(section => {
      if (!section.renderSize) {
        migrated = true;
        return {
          ...section,
          renderSize: '1024x1024' as RenderSize // Default to square format
        };
      }
      return section;
    });

    if (migrated) {
      console.log('Migrated sections to include renderSize field');
      const migratedConfig = {
        ...config,
        sections: migratedSections
      };
      // Save migrated config back to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedConfig));
      return migratedConfig;
    }

    return config;
  }
}

// Export singleton instance
export const clientImageConfig = new ClientImageConfigManager();
