const fs = require('fs');

let mdCode = fs.readFileSync('src/utils/markdown.js', 'utf8');

const videoExtractPatch = `
    // Extract video markers
    const videoRegex = /__VIDEO__(.*?)__VIDEO__/g;
    const videos = [];
    let videoMatch;
    while ((videoMatch = videoRegex.exec(textContent)) !== null) {
      videos.push(videoMatch[1]);
    }
    textContent = textContent.replace(videoRegex, '');
`;

mdCode = mdCode.replace(/\/\/ Extract search markers/, videoExtractPatch + '\n    // Extract search markers');

const videoRenderPatch = `
    // Append video data
    if (videos.length > 0) {
      videos.forEach(url => {
        html += '<div class="video-result-tool">' +
                '<video controls src="' + escapeHtml(url) + '" class="markdown-video" style="max-width: 100%; border-radius: 12px; margin: 1rem 0; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"></video>' +
                '</div>';
      });
    }
`;

mdCode = mdCode.replace(/\/\/ Append search data/, videoRenderPatch + '\n    // Append search data');

fs.writeFileSync('src/utils/markdown.js', mdCode);
console.log("Patched markdown.js with video!");
