#!/usr/bin/env node

/**
 * Script to generate markdown tables from projectList.js data
 * 
 * This script reads project data from pollinations.ai/src/config/projectList.js
 * and generates markdown tables for each category, similar to those in README.md.
 * 
 * It can either:
 * 1. Generate a standalone PROJECTS.md file
 * 2. Update the README.md file by replacing content between special markers
 */

import fs from 'fs/promises';
import path from 'path';

// Special markers to identify the section in README.md to replace
// These are HTML comments that won't be visible in the rendered markdown
const START_MARKER = '<!-- AUTO-GENERATED-CONTENT:START -->';
const END_MARKER = '<!-- AUTO-GENERATED-CONTENT:END -->';

// Function to check if a project is new (submitted within the last 15 days)
const isNewProject = (project) => {
  if (!project.submissionDate) {
    return false;
  }

  try {
    const submissionDate = new Date(project.submissionDate);
    const now = new Date();
    const diffTime = Math.abs(now - submissionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 15;
  } catch (error) {
    return false;
  }
};

// Function to format links for the markdown table
const formatLinks = (project) => {
  const links = [];
  
  if (project.url) {
    links.push(`[Website](${project.url})`);
  }
  
  if (project.repo) {
    const starsText = project.stars ? ` - ⭐ ${(project.stars / 1000).toFixed(1)}k` : 
                     (project.stars === 0 ? ` - ⭐ 0` : '');
    links.push(`[GitHub](${project.repo})${starsText}`);
  }
  
  if (project.demo) {
    links.push(`[Demo](${project.demo})`);
  }
  
  return links.join(', ');
};

// Function to format author information
const formatAuthor = (project) => {
  return project.author || '-';
};

// Function to generate markdown table for a category
const generateCategoryTable = (categoryKey, categoryTitle, projects) => {
  const categoryProjects = projects[categoryKey];
  
  if (!categoryProjects || categoryProjects.length === 0) {
    return '';
  }
  
  let markdown = `### ${categoryTitle}\n\n`;
  markdown += '| Project | Description | Creator | Links |\n';
  markdown += '|---------|-------------|---------|-------|\n';
  
  // Sort projects by order and stars
  const sortedProjects = [...categoryProjects]
    .filter(project => !project.hidden)
    .sort((a, b) => {
      // First compare by order (lower order comes first)
      const orderA = typeof a.order === 'number' ? a.order : 3;
      const orderB = typeof b.order === 'number' ? b.order : 3;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Then compare by stars (higher stars come first)
      const starsA = a.stars || 0;
      const starsB = b.stars || 0;
      
      return starsB - starsA;
    });
  
  for (const project of sortedProjects) {
    const isNew = isNewProject(project);
    const newTag = isNew ? '🆕 ' : '';
    
    // Add language emoji if available
    let languageEmoji = '';
    if (project.language) {
      // Add language emoji based on language code
      // This is a simplified version - you might want to expand this mapping
      if (project.language === 'zh-CN') languageEmoji = '🇨🇳 ';
      else if (project.language === 'id-ID') languageEmoji = '🇮🇩 ';
      else if (project.language === 'pt-BR') languageEmoji = '🇧🇷 ';
      else if (project.language === 'es-ES') languageEmoji = '🇪🇸 ';
    }
    
    // Add project type emoji if we can detect it from the name or description
    let typeEmoji = '';
    const lowerName = project.name.toLowerCase();
    const lowerDesc = project.description ? project.description.toLowerCase() : '';
    
    if (lowerName.includes('bot') || lowerDesc.includes('bot')) {
      typeEmoji = '🤖 ';
    } else if (lowerName.includes('desktop') || lowerDesc.includes('desktop')) {
      typeEmoji = '🖥️ ';
    }
    
    markdown += `| ${newTag}${typeEmoji}${languageEmoji}${project.name} | ${project.description || '-'} | ${formatAuthor(project)} | ${formatLinks(project)} |\n`;
  }
  
  return markdown + '\n';
};

// Generate the markdown content for all project tables
const generateProjectMarkdown = (categories, projects) => {
  let markdown = '> **Note:** Some projects may be temporarily hidden from this list if they are currently broken or undergoing maintenance.\n\n';
  markdown += 'Pollinations.AI is used in various projects, including:\n\n';
  
  // Generate tables for each category
  for (const category of categories) {
    markdown += generateCategoryTable(category.key, category.title, projects);
  }
  
  return markdown;
};

// Function to update README.md by replacing content between markers
const updateReadme = async (markdownContent) => {
  const readmePath = path.join(process.cwd(), 'README.md');
  
  try {
    // Read the current README content
    const readmeContent = await fs.readFile(readmePath, 'utf8');
    
    // Check if markers exist in the README
    if (!readmeContent.includes(START_MARKER) || !readmeContent.includes(END_MARKER)) {
      console.log(`Markers not found in README.md. Please add the following markers to define where the project list should be inserted:
      ${START_MARKER}
      ${END_MARKER}`);
      return false;
    }
    
    // Replace content between markers
    const startIndex = readmeContent.indexOf(START_MARKER) + START_MARKER.length;
    const endIndex = readmeContent.indexOf(END_MARKER);
    
    if (startIndex >= endIndex) {
      console.log('Invalid marker positions in README.md');
      return false;
    }
    
    const newReadmeContent = 
      readmeContent.substring(0, startIndex) + 
      '\n\n' + markdownContent + '\n' + 
      readmeContent.substring(endIndex);
    
    // Write the updated README
    await fs.writeFile(readmePath, newReadmeContent, 'utf8');
    console.log('README.md updated successfully with new project tables');
    return true;
  } catch (error) {
    console.error('Error updating README.md:', error);
    return false;
  }
};

// Main function to generate project tables and update files
const main = async () => {
  try {
    // Dynamically import the project data
    const projectModule = await import('../pollinations.ai/src/config/projectList.js');
    const { categories, projects } = projectModule;
    
    // Generate the markdown content
    const markdownContent = generateProjectMarkdown(categories, projects);
    
    // Always write to PROJECTS.md as a standalone file
    const projectsPath = path.join(process.cwd(), 'PROJECTS.md');
    await fs.writeFile(projectsPath, markdownContent, 'utf8');
    console.log(`Project tables generated successfully at ${projectsPath}`);
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const updateReadmeFlag = args.includes('--update-readme') || args.includes('-u');
    
    // Update README.md if requested
    if (updateReadmeFlag) {
      await updateReadme(markdownContent);
    }
  } catch (error) {
    console.error('Error generating project tables:', error);
    process.exit(1);
  }
};

// Execute the script
main();
