/**
 * Markdown configuration parser for image generation
 * Parses a single Markdown file into structured configuration data
 */

import type { ClientImageConfig, ClientImageSection, RenderSize } from './clientImageConfig';

export interface ParsedMarkdownConfig {
  projectPrompt: string;
  imageInputUrl?: string;
  sections: ClientImageSection[];
  imageSelections: Record<string, string[]>;
}

export class MarkdownConfigParser {
  /**
   * Parse Markdown content into structured configuration
   */
  static parseMarkdown(markdownContent: string): ParsedMarkdownConfig {
    console.log('🔍 MarkdownConfigParser: Starting to parse markdown with --- delimiters');
    
    // Split content by --- delimiters
    const blocks = markdownContent.split(/\n---\n/);
    console.log('📦 Found blocks:', blocks.length);
    
    let projectPrompt = '';
    let imageInputUrl = '';
    const sections: ClientImageSection[] = [];
    const imageSelections: Record<string, string[]> = {};
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      console.log(`📝 Processing block ${i} (length: ${block.length}):`, block.substring(0, 200) + '...');
      
      if (i === 0) {
        // First block contains project prompt and possibly image URL
        const lines = block.split('\n');
        let inProject = false;
        let inImageUrl = false;
        const projectLines: string[] = [];
        const imageUrlLines: string[] = [];
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (trimmedLine === '## Project') {
            inProject = true;
            inImageUrl = false;
            continue;
          }
          
          if (trimmedLine === '## Image Input URL') {
            inProject = false;
            inImageUrl = true;
            continue;
          }
          
          if (inProject) {
            projectLines.push(line);
          } else if (inImageUrl) {
            // Skip HTML comments
            if (!trimmedLine.startsWith('<!--') && !trimmedLine.endsWith('-->')) {
              imageUrlLines.push(line);
            }
          }
        }
        
        projectPrompt = projectLines.join('\n').trim();
        imageInputUrl = imageUrlLines.join('\n').trim();
        
        console.log('📋 Project prompt extracted:', projectPrompt.substring(0, 100) + '...');
        console.log('🔗 Image URL extracted:', imageInputUrl || 'none');
        
      } else {
        // Each subsequent block is a section - extract content and images
        const sectionContent = block.trim();
        if (sectionContent) {
          const lines = sectionContent.split('\n');
          let description = '';
          const imageUrls: string[] = [];
          let inImagesSection = false;
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine === '### Images') {
              inImagesSection = true;
              continue;
            }
            
            if (inImagesSection) {
              if (trimmedLine.startsWith('- ') && trimmedLine.includes('http')) {
                imageUrls.push(trimmedLine.substring(2).trim());
              }
            } else {
              // Skip metadata lines but keep content
              if (!trimmedLine.startsWith('**') && !trimmedLine.startsWith('## Section')) {
                description += line + '\n';
              }
            }
          }
          
          const section = {
            id: `section-${String(i).padStart(3, '0')}`,
            order: i - 1, // Start from 0 for first section
            description: description.trim(),
            active: true,
            renderSize: '1024x1024' as RenderSize // Default render size for parsed sections
          };
          sections.push(section);
          
          // Store image URLs for this section
          if (imageUrls.length > 0) {
            imageSelections[section.id] = imageUrls;
            console.log(`📸 Found ${imageUrls.length} images for section ${section.id}`);
          }
          
          console.log(`✅ Created section ${section.id} with content:`, description.substring(0, 100) + '...');
        }
      }
    }
    
    console.log('✅ MarkdownConfigParser: Finished parsing');
    console.log('📊 Results:', { 
      projectPromptLength: projectPrompt.length, 
      imageInputUrl: imageInputUrl || 'none', 
      sectionsCount: sections.length 
    });
    console.log('📋 Sections:', sections);
    
    return {
      projectPrompt,
      imageInputUrl: imageInputUrl || undefined,
      sections,
      imageSelections
    };
  }

  /**
   * Convert config back to Markdown (round-trips with parseMarkdown)
   */
  static configToMarkdown(config: ClientImageConfig): string {
    const lines: string[] = [];

    lines.push('# Image Generation Configuration');
    lines.push('');
    lines.push('## Project');
    lines.push('');
    lines.push(config.project);
    lines.push('');
    lines.push('## Image Input URL');
    lines.push('');
    if (config.imageUrl?.trim()) {
      lines.push(config.imageUrl.trim());
    }

    const sorted = [...config.sections].sort((a, b) => a.order - b.order);
    for (const section of sorted) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(section.description);

      const images = config.imageSelections[section.id];
      if (images && images.length > 0) {
        lines.push('');
        lines.push('### Images');
        for (const url of images) {
          lines.push(`- ${url}`);
        }
      }
    }

    return lines.join('\n');
  }
}
