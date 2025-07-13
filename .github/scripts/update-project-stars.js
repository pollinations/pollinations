import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import project arrays from category files
const vibeCoding = (await import('../../pollinations.ai/src/config/projects/vibeCoding.js')).default;
const creative = (await import('../../pollinations.ai/src/config/projects/creative.js')).default;
const games = (await import('../../pollinations.ai/src/config/projects/games.js')).default;
const hackAndBuild = (await import('../../pollinations.ai/src/config/projects/hackAndBuild.js')).default;
const chat = (await import('../../pollinations.ai/src/config/projects/chat.js')).default;
const socialBots = (await import('../../pollinations.ai/src/config/projects/socialBots.js')).default;
const learn = (await import('../../pollinations.ai/src/config/projects/learn.js')).default;

// Category file mappings
const categoryFiles = {
  vibeCoding: {
    array: vibeCoding,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/vibeCoding.js')
  },
  creative: {
    array: creative,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/creative.js')
  },
  games: {
    array: games,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/games.js')
  },
  hackAndBuild: {
    array: hackAndBuild,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/hackAndBuild.js')
  },
  chat: {
    array: chat,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/chat.js')
  },
  socialBots: {
    array: socialBots,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/socialBots.js')
  },
  learn: {
    array: learn,
    path: path.join(__dirname, '../../pollinations.ai/src/config/projects/learn.js')
  }
};

function extractOwnerAndRepo(url) {
  const githubRegex = /github\.com\/([^\/]+)\/([^\/\s]+)/;
  const match = url.match(githubRegex);

  if (match && match.length >= 3) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '')
    };
  }

  return null;
}

function fetchStarCount(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'GitHub-Star-Counter',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(parsed.stargazers_count);
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} - ${parsed.message}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.end();
  });
}

function formatStarCount(count) {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

// Custom formatter to output JavaScript objects without quoted keys
function formatJavaScriptObject(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  const nextSpaces = '  '.repeat(indent + 1);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    let result = '[\n';
    obj.forEach((item, index) => {
      result += nextSpaces + formatJavaScriptObject(item, indent + 1);
      if (index < obj.length - 1) result += ',';
      result += '\n';
    });
    result += spaces + ']';
    return result;
  }
  
  if (obj && typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    
    let result = '{\n';
    entries.forEach(([key, value], index) => {
      // Don't quote keys unless they contain special characters
      const needsQuotes = /[^a-zA-Z0-9_$]/.test(key) || /^[0-9]/.test(key);
      const formattedKey = needsQuotes ? `"${key}"` : key;
      
      result += nextSpaces + formattedKey + ': ';
      
      if (typeof value === 'string') {
        result += `"${value.replace(/"/g, '\\"')}"`;
      } else {
        result += formatJavaScriptObject(value, indent + 1);
      }
      
      if (index < entries.length - 1) result += ',';
      result += '\n';
    });
    result += spaces + '}';
    return result;
  }
  
  if (typeof obj === 'string') {
    return `"${obj.replace(/"/g, '\\"')}"`;
  }
  
  return String(obj);
}

function writeProjectFile(filePath, projectArray) {
  const formattedArray = formatJavaScriptObject(projectArray);
  const content = `export default ${formattedArray};\n`;
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

async function processProjectList() {
  const args = process.argv.slice(2);
  
  // If a specific repo is provided, fetch and display its star count
  if (args.length > 0) {
    const repoUrl = args[0];
    const repoInfo = extractOwnerAndRepo(repoUrl);
    
    if (!repoInfo) {
      console.error('Invalid GitHub URL format');
      process.exit(1);
    }
    
    try {
      const stars = await fetchStarCount(repoInfo.owner, repoInfo.repo);
      console.log(`${repoInfo.owner}/${repoInfo.repo}: ${formatStarCount(stars)} stars`);
    } catch (error) {
      console.error(`Error fetching stars for ${repoInfo.owner}/${repoInfo.repo}:`, error.message);
    }
    
    return;
  }

  // Process all project categories
  for (const [categoryName, categoryData] of Object.entries(categoryFiles)) {
    console.log(`\nProcessing ${categoryName}...`);
    let updatedProjects = 0;
    let addedStars = 0;
    let unchangedProjects = 0;

    for (const project of categoryData.array) {
      const githubUrl = project.url || project.repo;
      
      if (githubUrl && githubUrl.includes('github.com')) {
        const repoInfo = extractOwnerAndRepo(githubUrl);
        
        if (repoInfo) {
          try {
            const stars = await fetchStarCount(repoInfo.owner, repoInfo.repo);
            
            if (project.stars !== undefined) {
              if (project.stars !== stars) {
                console.log(`  Updated ${project.name}: ${project.stars} → ${stars} stars`);
                project.stars = stars;
                updatedProjects++;
              } else {
                console.log(`  Unchanged ${project.name}: ${stars} stars`);
                unchangedProjects++;
              }
            } else {
              console.log(`  Added ${project.name}: ${stars} stars`);
              project.stars = stars;
              addedStars++;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error) {
            console.error(`  Error fetching stars for ${project.name} (${repoInfo.owner}/${repoInfo.repo}):`, error.message);
          }
        }
      }
    }

    // Write updated project data back to file
    if (updatedProjects > 0 || addedStars > 0) {
      writeProjectFile(categoryData.path, categoryData.array);
    }

    console.log(`${categoryName} summary: ${addedStars} added, ${updatedProjects} updated, ${unchangedProjects} unchanged`);
  }

  console.log('\nStar count update complete!');
}

processProjectList().catch(console.error);
