#!/usr/bin/env node#!/usr/bin/env node#!/usr/bin/env node



import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';/**/**



const __filename = fileURLToPath(import.meta.url); * README Generator Script - Minimal Version * README Generator Script - Minimal Version

const __dirname = path.dirname(__filename);

 * Simple script to update README.md (or create minimal placeholder) * Simple script to update README.md (or create minimal placeholder)

async function generateReadme() {

  console.log('✅ README generation completed (minimal version)'); */ */

}



if (import.meta.url === `file://${process.argv[1]}`) {

  generateReadme().catch(console.error);import fs from 'fs';import fs from 'fs';

}

import path from 'path';import path from 'path';

export { generateReadme };
import { fileURLToPath } from 'url';import { fileURLToPath } from 'url';



const __filename = fileURLToPath(import.meta.url);const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);const __dirname = path.dirname(__filename);



async function generateReadme() {async function generateReadme() {

  console.log('🚀 Generating README.md...');  console.log('🚀 Generating README.md...');

    

  try {  try {

    const readmePath = path.join(__dirname, '../README.md');    const readmePath = path.join(__dirname, '../README.md');

        

    if (fs.existsSync(readmePath)) {    if (fs.existsSync(readmePath)) {

      console.log('✅ README.md already exists, no changes needed');      console.log('✅ README.md already exists, no changes needed');

    } else {    } else {

      console.log('⚠️  README.md not found, but this is expected for minimal setup');      console.log('⚠️  README.md not found, but this is expected for minimal setup');

    }    }

        

    console.log('✅ README generation completed!');    console.log('✅ README generation completed!');

        

  } catch (error) {  } catch (error) {

    console.error('❌ README generation failed:', error.message);    console.error('❌ README generation failed:', error.message);

    process.exit(1);    process.exit(1);

  }  }

}    

    this.categories.forEach(cat => {

// Run the generation if this script is executed directly      categoryCounts[cat.id] = this.projects.filter(p => p.category === cat.id).length;

if (import.meta.url === `file://${process.argv[1]}`) {    });

  generateReadme().catch(error => {

    console.error('Fatal error:', error);    return {

    process.exit(1);      totalProjects,

  });      totalStars,

}      featuredProjects,

      newProjects,

export { generateReadme };      categoryCounts
    };
  }

  /**
   * Generate the complete projects section
   */
  generateProjectsSection() {
    const sections = [];
    
    // Add header with stats
    sections.push(this.generateHeader());
    
    // Add note about features
    sections.push(this.generateFeaturesNote());
    
    // Add each category
    this.categories.forEach(category => {
      const categoryProjects = this.projects.filter(p => p.category === category.id);
      if (categoryProjects.length > 0) {
        sections.push(this.generateCategorySection(category, categoryProjects));
      }
    });

    // Add submission call-to-action
    sections.push(this.generateSubmissionCTA());

    return sections.join('\n\n');
  }

  /**
   * Generate the header section
   */
  generateHeader() {
    return `> **⭐ GitHub Star Counts:** Projects with GitHub repositories include star counts to help you gauge their popularity.
> 
> **🆕 NEW Tag:** Projects are marked with the 🆕 emoji when they are recently added. This tag is automatically removed after 15 days from the submission date or if no date is specified.
> 
${README_CONFIG.startMarker}

> **Note:** Some projects may be temporarily hidden from this list if they are currently broken or undergoing maintenance.

Pollinations.AI is used in various projects, including:`;
  }

  /**
   * Generate features note
   */
  generateFeaturesNote() {
    return '';
  }

  /**
   * Generate a category section
   */
  generateCategorySection(category, categoryProjects) {
    const sortedProjects = this.sortProjects(categoryProjects);
    const tableRows = sortedProjects.map(project => this.generateProjectRow(project));
    
    return `### ${category.title}

| Project | Description | Creator |
|---------|-------------|--------|
${tableRows.join('\n')}`;
  }

  /**
   * Sort projects within a category
   */
  sortProjects(projects) {
    return [...projects].sort((a, b) => {
      // Featured first
      if (a.featured !== b.featured) {
        return b.featured ? 1 : -1;
      }
      
      // Then by order
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      
      // Then by stars
      return (b.stars || 0) - (a.stars || 0);
    });
  }

  /**
   * Generate a single project row
   */
  generateProjectRow(project) {
    const name = this.formatProjectName(project);
    const description = this.formatDescription(project.description);
    const creator = this.formatCreator(project.author);
    
    return `| ${name} | ${description} | ${creator} |`;
  }

  /**
   * Format project name with links and badges
   */
  formatProjectName(project) {
    let name = project.name;
    
    // Add NEW badge if recent
    if (project.isNew) {
      name = `🆕 ${name}`;
    }
    
    // Add star count if available and above threshold
    const starBadge = project.stars && project.stars >= README_CONFIG.showStarsThreshold 
      ? ` ([⭐ ${this.formatNumber(project.stars)}](${project.repo}))` 
      : project.repo 
        ? ` ([⭐ ${project.stars || 0}](${project.repo}))` 
        : '';
    
    // Create main link
    const mainLink = `[${name}](${project.url})`;
    
    return `${mainLink}${starBadge}`;
  }

  /**
   * Format description with length limit
   */
  formatDescription(description) {
    if (description.length <= README_CONFIG.maxDescriptionLength) {
      return description;
    }
    
    // Truncate at word boundary
    const truncated = description.substring(0, README_CONFIG.maxDescriptionLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace) + '...';
  }

  /**
   * Format creator/author
   */
  formatCreator(author) {
    // Clean up author format
    const cleanAuthor = author.replace(/^@/, '');
    
    // Check if it's an email
    if (cleanAuthor.includes('@') && cleanAuthor.includes('.')) {
      return `[${cleanAuthor}](mailto:${cleanAuthor})`;
    }
    
    // Check if it's a link
    if (cleanAuthor.startsWith('http')) {
      return `[Link](${cleanAuthor})`;
    }
    
    // Return as-is with @ prefix if not already there
    return author.startsWith('@') ? author : `@${cleanAuthor}`;
  }

  /**
   * Format large numbers (K, M format)
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  /**
   * Generate submission call-to-action
   */
  generateSubmissionCTA() {
    return `${README_CONFIG.endMarker}

Have you created a project using Pollinations.AI? [Submit it through our project submission form](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml) to get it listed here! We use a structured GitHub issue template to make the submission process easy and organized.`;
  }

  /**
   * Generate enhanced table of contents
   */
  generateTableOfContents() {
    const tocEntries = this.categories.map(category => {
      const count = this.stats.categoryCounts[category.id] || 0;
      return `- [${category.title}](#${this.generateAnchor(category.title)}) (${count} projects)`;
    });

    return `${README_CONFIG.tableOfContentsMarker}
## 📊 Project Categories

${tocEntries.join('\n')}

**Total: ${this.stats.totalProjects} projects across ${this.categories.length} categories**

${README_CONFIG.tableOfContentsEndMarker}`;
  }

  /**
   * Generate GitHub-compatible anchor links
   */
  generateAnchor(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
}

/**
 * Update README.md file with generated content
 */
export async function updateReadme(projectsDataPath, readmePath) {
  console.log('🚀 Generating README projects section...');
  
  try {
    // Load project data
    const projectsDataFile = await fs.promises.readFile(projectsDataPath, 'utf8');
    const projectsData = JSON.parse(projectsDataFile);
    
    // Generate new content
    const generator = new ReadmeGenerator(projectsData);
    const newProjectsSection = generator.generateProjectsSection();
    const newTOC = generator.generateTableOfContents();
    
    // Read current README
    const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
    
    // Replace projects section
    const startIndex = readmeContent.indexOf(README_CONFIG.startMarker);
    const endIndex = readmeContent.indexOf(README_CONFIG.endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Could not find auto-generation markers in README.md');
    }
    
    const beforeProjects = readmeContent.substring(0, startIndex);
    const afterProjects = readmeContent.substring(endIndex + README_CONFIG.endMarker.length);
    
    // Combine all parts
    const newReadmeContent = beforeProjects + newProjectsSection + afterProjects;
    
    // Handle TOC if markers exist
    let finalContent = newReadmeContent;
    const tocStartIndex = finalContent.indexOf(README_CONFIG.tableOfContentsMarker);
    const tocEndIndex = finalContent.indexOf(README_CONFIG.tableOfContentsEndMarker);
    
    if (tocStartIndex !== -1 && tocEndIndex !== -1) {
      const beforeTOC = finalContent.substring(0, tocStartIndex);
      const afterTOC = finalContent.substring(tocEndIndex + README_CONFIG.tableOfContentsEndMarker.length);
      finalContent = beforeTOC + newTOC + afterTOC;
    }
    
    // Write updated README
    await fs.promises.writeFile(readmePath, finalContent, 'utf8');
    
    // Generate statistics
    const stats = generator.stats;
    console.log('✅ README.md updated successfully!');
    console.log(`📊 Statistics:`);
    console.log(`   Total projects: ${stats.totalProjects}`);
    console.log(`   Total GitHub stars: ${stats.totalStars.toLocaleString()}`);
    console.log(`   Featured projects: ${stats.featuredProjects}`);
    console.log(`   New projects: ${stats.newProjects}`);
    console.log(`   Categories: ${Object.entries(stats.categoryCounts).map(([cat, count]) => `${cat}(${count})`).join(', ')}`);
    
    return {
      success: true,
      stats,
      projectsGenerated: stats.totalProjects
    };
    
  } catch (error) {
    console.error('❌ Error updating README:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate project submission template
 */
export function generateSubmissionTemplate() {
  return `---
name: 🚀 Project Submission
description: Submit your project built with Pollinations.AI to be featured in our ecosystem
title: "[PROJECT] Your Project Name"
labels: ["project-submission", "community"]
assignees: []
body:
  - type: markdown
    attributes:
      value: |
        Thanks for submitting your project! Please fill out the information below to help us showcase your work in the Pollinations.AI ecosystem.

  - type: input
    id: project-name
    attributes:
      label: Project Name
      description: What's the name of your project?
      placeholder: "e.g., AI Image Generator Pro"
    validations:
      required: true

  - type: input
    id: project-url
    attributes:
      label: Project URL
      description: Where can people access your project?
      placeholder: "https://example.com"
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Project Description
      description: Describe what your project does (50-500 characters)
      placeholder: "A detailed description of your project's functionality and features..."
    validations:
      required: true

  - type: input
    id: author
    attributes:
      label: Creator/Author
      description: Your username or handle
      placeholder: "@username"
    validations:
      required: true

  - type: input
    id: repository
    attributes:
      label: GitHub Repository (Optional)
      description: Link to your project's source code
      placeholder: "https://github.com/username/project"

  - type: dropdown
    id: category
    attributes:
      label: Project Category
      description: Which category best fits your project?
      options:
        - "Vibe Coding ✨ (No-code builders & playgrounds)"
        - "Creative 🎨 (Image, video, music generation)"
        - "Games 🎲 (AI-powered gaming experiences)"
        - "Hack & Build 🛠️ (SDKs, tools, integrations)"
        - "Chat 💬 (Conversational interfaces)"
        - "Social Bots 🤖 (Platform bots & NPCs)"
        - "Learn 📚 (Educational resources)"
    validations:
      required: true

  - type: checkboxes
    id: platforms
    attributes:
      label: Platforms
      description: Which platforms does your project support?
      options:
        - label: Web
        - label: Mobile (iOS/Android)
        - label: Desktop
        - label: Discord Bot
        - label: Telegram Bot
        - label: Chrome Extension
        - label: VS Code Extension
        - label: API/SDK
        - label: Other

  - type: checkboxes
    id: pollinations-features
    attributes:
      label: Pollinations Features Used
      description: Which Pollinations.AI features does your project use?
      options:
        - label: Image Generation
        - label: Text Generation
        - label: Audio Generation
        - label: MCP Server
        - label: React Hooks
        - label: Direct API

  - type: checkboxes
    id: access-type
    attributes:
      label: Access Type
      description: How can users access your project?
      options:
        - label: Free
        - label: Open Source
        - label: Freemium
        - label: Paid

  - type: textarea
    id: tech-stack
    attributes:
      label: Technology Stack
      description: What technologies did you use to build this project?
      placeholder: "React, Node.js, Pollinations API, etc."

  - type: checkboxes
    id: terms
    attributes:
      label: Submission Guidelines
      description: Please confirm you agree to our submission guidelines
      options:
        - label: My project actually uses Pollinations.AI services
          required: true
        - label: I have tested that my project is working and accessible
          required: true
        - label: I agree to the project being featured in the Pollinations.AI ecosystem
          required: true
`;
}

/**
 * CLI interface
 */
async function main() {
  const projectsDataPath = path.join(__dirname, '../shared/data/projects.json');
  const readmePath = path.join(__dirname, '../README.md');
  
  console.log('📝 Updating README.md with latest project data...');
  
  const result = await updateReadme(projectsDataPath, readmePath);
  
  if (result.success) {
    console.log('\n🎉 README generation completed successfully!');
    
    // Also generate the submission template
    const templatePath = path.join(__dirname, '../.github/ISSUE_TEMPLATE/project-submission.yml');
    const templateContent = generateSubmissionTemplate();
    
    try {
      await fs.promises.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.promises.writeFile(templatePath, templateContent, 'utf8');
      console.log('📋 Project submission template updated!');
    } catch (error) {
      console.log('⚠️  Could not update submission template:', error.message);
    }
    
  } else {
    console.error('\n❌ README generation failed:', result.error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ReadmeGenerator, updateReadme };