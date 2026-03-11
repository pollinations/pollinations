import MarkdownIt from 'markdown-it';
import markdownitHighlightjs from 'markdown-it-highlightjs';
import hljs from 'highlight.js';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';
import { marked } from 'marked';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

marked.setOptions({
  gfm: true,
  breaks: false,
  mangle: false,
  headerIds: false,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch (error) {
        console.warn('Highlight error (marked):', error);
      }
    }
    return escapeHtml(code);
  }
});

marked.use({
  tokenizer: {
    html(src) {
      const match = src.match(/^<[^>]*>/);
      if (match) {
        const raw = match[0];
        return {
          type: 'text',
          raw,
          text: escapeHtml(raw)
        };
      }
      return undefined;
    }
  }
});

const md = new MarkdownIt({
  html: false, // Disable HTML for security
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="code-block"><code class="hljs language-' + lang + '">' +
               hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
               '</code></pre>';
      } catch (__) {}
    }
    return '<pre class="code-block"><code class="hljs">' + escapeHtml(str) + '</code></pre>';
  }
}).use(markdownitHighlightjs);

// Function to render LaTeX math equations
const renderMath = (html) => {
  if (typeof document === 'undefined') {
    return html;
  }

  const div = document.createElement('div');
  div.innerHTML = html;

  try {
    renderMathInElement(div, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      katex
    });
  } catch (error) {
    console.error('KaTeX rendering error:', error);
  }

  return div.innerHTML;
};

export const formatMessage = (content) => {
  if (!content) return '';
  
  try {
    // Ensure content is a string
    let textContent = String(content);
    
    // Trim leading/trailing whitespace to avoid large gaps when rendering
    textContent = textContent.trim();
    
    // Collapse excessive vertical whitespace (3+ newlines -> 2 newlines)
    textContent = textContent.replace(/\n{3,}/g, '\n\n');
    
    // Preserve leading spaces for proper formatting
    
    // Remove multiple consecutive spaces (but not in code blocks or inline code)
    textContent = textContent.replace(/([^`\n])([ ]{2,})([^`\n])/g, '$1 $3');
    
    
    
    

    
    

    
    

    
    // Extract HTML preview markers
    const previewRegex = /__HTML_PREVIEW__(.*?)__HTML_PREVIEW__/g;
    const previews = [];
    let previewMatch;
    while ((previewMatch = previewRegex.exec(textContent)) !== null) {
      try {
        previews.push(JSON.parse(previewMatch[1]));
      } catch(e) {}
    }
    textContent = textContent.replace(previewRegex, '');

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

    
    // Extract video markers
    const videoRegex = /__VIDEO__(.*?)__VIDEO__/g;
    const videos = [];
    let videoMatch;
    while ((videoMatch = videoRegex.exec(textContent)) !== null) {
      videos.push(videoMatch[1]);
    }
    textContent = textContent.replace(videoRegex, '');

    // Extract search markers
    const searchRegex = /__SEARCH__(.*?)__SEARCH__/g;
    const searches = [];
    let searchMatch;
    while ((searchMatch = searchRegex.exec(textContent)) !== null) {
      searches.push(searchMatch[1]);
    }
    textContent = textContent.replace(searchRegex, '');

    
    // First, render markdown
    let html = md.render(textContent);
    
    // Then, render LaTeX math equations
    html = renderMath(html);
    
    
    
    // Append HTML preview data
    if (previews.length > 0) {
      previews.forEach(preview => {
        html += "<div class='html-preview-tool' data-preview='" + escapeHtml(JSON.stringify(preview)) + "'></div>";
      });
    }

    
    // Append HTML preview data
    if (previews.length > 0) {
      previews.forEach(preview => {
        html += "<div class='html-preview-tool' data-preview='" + escapeHtml(JSON.stringify(preview)) + "'></div>";
      });
    }

    // Append chart data
    if (charts.length > 0) {
      html += "<div data-charts='" + JSON.stringify(charts).replace(/'/g, "&apos;") + "'></div>";
    }

    
    // Append video data
    if (videos.length > 0) {
      videos.forEach(url => {
        html += '<div class="video-result-tool">' +
                '<video controls src="' + escapeHtml(url) + '" class="markdown-video" style="max-width: 100%; border-radius: 12px; margin: 1rem 0; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"></video>' +
                '</div>';
      });
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

  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Return escaped HTML as fallback
    return escapeHtml(String(content));
  }
};

export const formatStreamingMessage = (content) => {
  if (!content) return '';

  try {
    let textContent = String(content || '');
    
    // More aggressive whitespace normalization for streaming
    textContent = textContent.trim();
    
    // Collapse excessive vertical whitespace (3+ newlines -> 2 newlines)
    textContent = textContent.replace(/\n{3,}/g, '\n\n');
    
    // Preserve leading spaces for proper formatting
    
    // Remove multiple consecutive spaces (but not in code blocks)
    textContent = textContent.replace(/([^`\n])([ ]{2,})([^`\n])/g, '$1 $3');
    
    const html = marked.parse(textContent, { async: false });
    return renderMath(html);
  } catch (error) {
    console.error('Streaming markdown rendering error:', error);
    return escapeHtml(String(content));
  }
};
