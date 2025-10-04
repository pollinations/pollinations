import fs from 'fs';
import path from 'path';

/**
 * Generates comprehensive README.md documentation for Pollinations.AI project discovery system
 * Creates beautiful, maintainable project listings from existing category files
 */

// Use path resolution that works both locally and in CI
const PROJECT_FILES_DIR = process.env.GITHUB_ACTIONS 
  ? 'pollinations.ai/src/config/projects'  // CI environment
  : '../pollinations.ai/src/config/projects'; // Local development
const README_PATH = process.env.GITHUB_ACTIONS ? 'README.md' : '../README.md';

// Helper function to read project files and extract data
function readProjectsFromFiles() {
  const projectsDir = path.resolve(PROJECT_FILES_DIR);
  
  if (!fs.existsSync(projectsDir)) {
    console.error(`❌ Projects directory not found: ${projectsDir}`);
    process.exit(1);
  }
  
  const projectFiles = fs.readdirSync(projectsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(projectsDir, file));
  
  const allProjects = {};
  let totalProjects = 0;
  let totalStars = 0;
  
  for (const filePath of projectFiles) {
    const categoryKey = path.basename(filePath, '.js');
    console.log(`📂 Reading ${categoryKey}.js...`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const projects = extractProjectsFromContent(content);
      
      allProjects[categoryKey] = projects;
      totalProjects += projects.length;
      
      // Calculate total stars
      for (const project of projects) {
        if (project.stars && typeof project.stars === 'number') {
          totalStars += project.stars;
        }
      }
      
      console.log(`  ✅ Found ${projects.length} projects`);
    } catch (error) {
      console.error(`  ❌ Error reading ${categoryKey}: ${error.message}`);
    }
  }
  
  return { allProjects, totalProjects, totalStars };
}

// Helper function to extract project objects from file content
function extractProjectsFromContent(content) {
  const projects = [];
  
  // Use regex to find project objects
  const projectMatches = content.matchAll(/\{\s*name:\s*["']([^"']+)["'][^}]*?\}/gs);
  
  for (const match of projectMatches) {
    try {
      const projectStr = match[0];
      
      // Parse individual fields using regex
      const nameMatch = projectStr.match(/name:\s*["']([^"']+)["']/);
      const urlMatch = projectStr.match(/url:\s*["']([^"']+)["']/);
      const descMatch = projectStr.match(/description:\s*["']([^"']+)["']/);
      const authorMatch = projectStr.match(/author:\s*["']([^"']+)["']/);
      const repoMatch = projectStr.match(/repo:\s*["']([^"']+)["']/);
      const orderMatch = projectStr.match(/order:\s*(\d+)/);
      const starsMatch = projectStr.match(/stars:\s*(\d+)/);
      const hiddenMatch = projectStr.match(/hidden:\s*(true|false)/);
      
      const project = {
        name: nameMatch ? nameMatch[1] : '',
        url: urlMatch ? urlMatch[1] : '',
        description: descMatch ? descMatch[1] : '',
        author: authorMatch ? authorMatch[1] : '',
        repo: repoMatch ? repoMatch[1] : undefined,
        order: orderMatch ? parseInt(orderMatch[1]) : 3,
        stars: starsMatch ? parseInt(starsMatch[1]) : undefined,
        hidden: hiddenMatch ? hiddenMatch[1] === 'true' : false
      };
      
      // Only include non-hidden projects
      if (!project.hidden && project.name && project.url) {
        projects.push(project);
      }
    } catch (error) {
      console.warn(`Failed to parse project: ${error.message}`);
    }
  }
  
  // Sort by order (ascending), then by stars (descending), then by name
  return projects.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if ((b.stars || 0) !== (a.stars || 0)) return (b.stars || 0) - (a.stars || 0);
    return a.name.localeCompare(b.name);
  });
}

// Helper function to format project as markdown table row
function formatProjectRow(project) {
  const name = project.name;
  const description = project.description.length > 100 
    ? project.description.substring(0, 97) + '...' 
    : project.description;
  
  const author = project.author || '';
  
  // Format stars
  const stars = project.stars 
    ? `⭐ ${project.stars}` 
    : '';
  
  // Create main link
  const mainLink = `[${name}](${project.url})`;
  
  // Add repo link if available
  const repoLink = project.repo 
    ? ` ([repo](${project.repo}))` 
    : '';
  
  const links = mainLink + repoLink;
  
  return `| ${links} | ${description} | ${author} | ${stars} |`;
}

// Helper function to get category display information
function getCategoryInfo(categoryKey) {
  const categoryMap = {
    'vibeCoding': {
      title: 'Vibe Coding ✨',
      emoji: '✨',
      description: 'No-code builders and creative playgrounds'
    },
    'creative': {
      title: 'Creative 🎨', 
      emoji: '🎨',
      description: 'Image, video, music, and art generation tools'
    },
    'games': {
      title: 'Games 🎲',
      emoji: '🎲', 
      description: 'AI-powered gaming experiences and interactive entertainment'
    },
    'hackAndBuild': {
      title: 'Hack & Build 🛠️',
      emoji: '🛠️',
      description: 'SDKs, tools, integrations, and developer resources'
    },
    'chat': {
      title: 'Chat 💬',
      emoji: '💬',
      description: 'Conversational AI interfaces and chatbots'
    },
    'socialBots': {
      title: 'Social Bots 🤖',
      emoji: '🤖',
      description: 'Discord, Telegram, and social platform automation'
    },
    'learn': {
      title: 'Learn 📚',
      emoji: '📚',
      description: 'Educational resources and learning tools'
    }
  };
  
  return categoryMap[categoryKey] || {
    title: categoryKey,
    emoji: '📦',
    description: 'Community projects'
  };
}

// Main function to generate README content
function generateReadmeContent(allProjects, totalProjects, totalStars) {
  const sections = [];
  
  // Header
  sections.push(`# 🌟 Pollinations.AI Community Projects

> Discover amazing AI-powered projects from our vibrant community

[![Projects](https://img.shields.io/badge/Projects-${totalProjects}-blue.svg)](https://pollinations.ai/projects)
[![GitHub Stars](https://img.shields.io/badge/Stars-${totalStars.toLocaleString()}-yellow.svg)](https://github.com/pollinations)
[![Community](https://img.shields.io/badge/Community-Active-green.svg)](https://discord.gg/k9F7SyTgqn)
[![Web Interface](https://img.shields.io/badge/Explore-pollinations.ai/projects-purple.svg)](https://pollinations.ai/projects)

## 🚀 Quick Start

- **🌐 Explore Projects**: Visit [pollinations.ai/projects](https://pollinations.ai/projects) for an interactive discovery experience
- **🤝 Submit Your Project**: Use our [submission form](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml)
- **💬 Join Community**: Connect with creators on [Discord](https://discord.gg/k9F7SyTgqn)

---`);

  // Project categories
  const categoryOrder = ['vibeCoding', 'creative', 'games', 'hackAndBuild', 'chat', 'socialBots', 'learn'];
  
  for (const categoryKey of categoryOrder) {
    if (!allProjects[categoryKey] || allProjects[categoryKey].length === 0) continue;
    
    const categoryInfo = getCategoryInfo(categoryKey);
    const projects = allProjects[categoryKey];
    
    sections.push(`
## ${categoryInfo.title}

> ${categoryInfo.description}

| Project | Description | Author | Stars |
|---------|-------------|--------|-------|`);
    
    for (const project of projects) {
      sections.push(formatProjectRow(project));
    }
  }
  
  // Footer with stats and contribution info
  const topProjects = Object.values(allProjects)
    .flat()
    .filter(p => p.stars && p.stars > 0)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 5);
  
  sections.push(`

---

## 📊 Ecosystem Stats

- **Total Projects**: ${totalProjects}
- **GitHub Stars**: ${totalStars.toLocaleString()}
- **Categories**: ${Object.keys(allProjects).length}
- **Active Contributors**: ${new Set(Object.values(allProjects).flat().map(p => p.author)).size}

### 🌟 Top Starred Projects`);

  if (topProjects.length > 0) {
    for (const [index, project] of topProjects.entries()) {
      const medal = ['🥇', '🥈', '🥉', '🏅', '🏅'][index];
      sections.push(`${medal} [${project.name}](${project.url}) - ⭐ ${project.stars} stars`);
    }
  }

  sections.push(`

## 🤝 Contributing

### Submit Your Project

1. **Use our template**: [Project Submission Form](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml)
2. **Fill out details**: Name, URL, description, category
3. **Automatic processing**: Your project will be reviewed and added automatically
4. **Join the ecosystem**: Featured on [pollinations.ai/projects](https://pollinations.ai/projects)

### Contribution Guidelines

- **Quality First**: Ensure your project is functional and well-documented
- **Clear Description**: Write a concise, compelling description (50-500 characters)
- **Proper Category**: Choose the most appropriate category for discovery
- **Community Standards**: Follow our [Code of Conduct](CODE_OF_CONDUCT.md)

---

## 🛠️ For Developers

### Project Discovery API

The project data is available through our structured data system:

\`\`\`javascript
// Access projects programmatically
import { projects } from './pollinations.ai/src/config/projectList.js';

// Get all projects in a category
const creativeProjects = projects.creative;

// Filter by criteria
const highStarProjects = projects.hackAndBuild
  .filter(p => p.stars > 100);
\`\`\`

### Local Development

\`\`\`bash
# Clone the repository
git clone https://github.com/pollinations/pollinations.git

# Navigate to projects
cd pollinations/pollinations.ai

# Install dependencies
npm install

# Start development server
npm start

# Visit http://localhost:3000/projects
\`\`\`

---

## 🌐 Links & Resources

- **🌟 [Pollinations.AI](https://pollinations.ai)** - Main platform
- **🔍 [Project Discovery](https://pollinations.ai/projects)** - Interactive project browser
- **📚 [Documentation](https://docs.pollinations.ai)** - API and integration guides
- **💬 [Discord Community](https://discord.gg/k9F7SyTgqn)** - Connect with creators
- **🐙 [GitHub](https://github.com/pollinations)** - Source code and contributions
- **🐦 [Twitter](https://twitter.com/pollinations_ai)** - Updates and announcements

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Special thanks to all the amazing creators who have contributed projects to the Pollinations.AI ecosystem. Your creativity and innovation make this community thrive!

---

<div align="center">
  <strong>🌸 Built with love by the Pollinations.AI community 🌸</strong>
  <br>
  <a href="https://pollinations.ai">pollinations.ai</a> • 
  <a href="https://discord.gg/k9F7SyTgqn">Discord</a> • 
  <a href="https://github.com/pollinations">GitHub</a>
</div>`);

  return sections.join('\n');
}

// Main execution function
async function generateReadme() {
  console.log('📚 Starting README generation...');
  
  try {
    // Read project data
    const { allProjects, totalProjects, totalStars } = readProjectsFromFiles();
    
    console.log(`\n📊 Statistics:`);
    console.log(`  Total projects: ${totalProjects}`);
    console.log(`  Total stars: ${totalStars.toLocaleString()}`);
    console.log(`  Categories: ${Object.keys(allProjects).length}`);
    
    // Generate content
    console.log('\n📝 Generating README content...');
    const readmeContent = generateReadmeContent(allProjects, totalProjects, totalStars);
    
    // Write to file
    const readmePath = path.resolve(README_PATH);
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    
    console.log(`\n✅ README.md generated successfully!`);
    console.log(`📁 File: ${readmePath}`);
    console.log(`📏 Size: ${Math.round(readmeContent.length / 1024)}KB`);
    
    // Show preview of first few lines
    const preview = readmeContent.split('\n').slice(0, 10).join('\n');
    console.log(`\n📖 Preview:\n${preview}...`);
    
  } catch (error) {
    console.error('💥 README generation failed:', error);
    process.exit(1);
  }
}

// Run the script
generateReadme().then(() => {
  console.log('\n🎉 README generation completed successfully!');
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
