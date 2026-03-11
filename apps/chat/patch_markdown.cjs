const fs = require('fs');

let mdCode = fs.readFileSync('src/utils/markdown.js', 'utf8');

const searchPatch = `
    // Extract chart markers
    const chartRegex = /__CHART__(.*?)__CHART__/g;
    const charts = [];
    let match;
    while ((match = chartRegex.exec(textContent)) !== null) {
      try {
        charts.push(JSON.parse(match[1]));
      } catch (e) {
        console.error('Failed to parse chart data:', e);
      }
    }
    textContent = textContent.replace(chartRegex, '');

    // Extract search markers
    const searchRegex = /__SEARCH__(.*?)__SEARCH__/g;
    const searches = [];
    let searchMatch;
    while ((searchMatch = searchRegex.exec(textContent)) !== null) {
      searches.push(searchMatch[1]);
    }
    textContent = textContent.replace(searchRegex, '');
`;

mdCode = mdCode.replace(/\/\/ Extract chart markers before rendering markdown[\s\S]*?textContent = textContent\.replace\(chartRegex, ''\);/m, searchPatch);

const htmlAppendPatch = `
    // Append chart data
    if (charts.length > 0) {
      html += "<div data-charts='" + JSON.stringify(charts).replace(/'/g, "&apos;") + "'></div>";
    }

    // Append search data
    if (searches.length > 0) {
      searches.forEach(qs => {
        const decoded = decodeURIComponent(qs);
        html += '<div class="search-result-tool">' +
                '<a href="https://duckduckgo.com/?q=' + qs + '" target="_blank" rel="noopener noreferrer" class="search-pill">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
                'Search Web: ' + escapeHtml(decoded) +
                '</a></div>';
      });
    }
    
    return html;
`;

mdCode = mdCode.replace(/\/\/ Append chart data for component to render[\s\S]*?return html;/m, htmlAppendPatch);

fs.writeFileSync('src/utils/markdown.js', mdCode);
console.log("Patched markdown.js!");
